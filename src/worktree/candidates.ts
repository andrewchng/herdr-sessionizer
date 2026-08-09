import type { Workspace } from "../client/types.ts";
import { normalizePath } from "../discovery/discovery.ts";

export const WORKTREE_CANDIDATE_ROW_DELIMITER = "\t";

export type WorktreeCandidate =
  | {
      id: string;
      kind: "workspace";
      label: string;
      branch: string;
      path?: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: "worktree";
      label: string;
      branch: string;
      path: string;
    }
  | {
      id: string;
      kind: "pull-request";
      label: string;
      branch: string;
      prNumber: number;
      title: string;
      headRefName: string;
      headOwner: string;
      isDraft?: boolean;
      isCrossRepository?: boolean;
      author?: string;
      headRepositoryNameWithOwner?: string;
      baseRefName?: string;
      additions?: number;
      deletions?: number;
      previewPath: string;
    }
  | {
      id: string;
      kind: "local-branch";
      label: string;
      branch: string;
      previewPath: string;
    }
  | {
      id: string;
      kind: "remote-branch";
      label: string;
      branch: string;
      base: string;
      previewPath: string;
    };

export interface GitWorktreeCandidate {
  path: string;
  branch?: string;
}

export interface GitBranchCandidates {
  local: string[];
  remote: string[];
}

export interface OpenPullRequest {
  number: number;
  title: string;
  headRefName: string;
  headOwner: string;
  isDraft?: boolean;
  isCrossRepository?: boolean;
  author?: string;
  headRepositoryNameWithOwner?: string;
  baseRefName?: string;
  additions?: number;
  deletions?: number;
}

export interface WorktreeCandidateRuntime {
  listGitWorktrees(project: string): Promise<GitWorktreeCandidate[]>;
  listGitBranches(project: string): Promise<GitBranchCandidates>;
  listOpenPullRequests(project: string): Promise<OpenPullRequest[]>;
}

export interface DiscoverWorktreeCandidateOptions {
  project: string;
  repoWorkspaceId?: string;
  workspaces: readonly Workspace[];
  runtime?: WorktreeCandidateRuntime;
}

export async function discoverWorktreeCandidates({
  project,
  repoWorkspaceId,
  workspaces,
  runtime = defaultWorktreeCandidateRuntime,
}: DiscoverWorktreeCandidateOptions): Promise<WorktreeCandidate[]> {
  const [gitWorktrees, gitBranches, openPullRequests] = await Promise.all([
    runtime.listGitWorktrees(project),
    runtime.listGitBranches(project),
    listOpenPullRequestsSoft(runtime, project),
  ]);
  return buildWorktreeCandidates({
    project,
    repoWorkspaceId,
    workspaces,
    gitWorktrees,
    gitBranches,
    openPullRequests,
  });
}

export interface BuildWorktreeCandidateOptions {
  project: string;
  repoWorkspaceId?: string;
  workspaces: readonly Workspace[];
  gitWorktrees: readonly GitWorktreeCandidate[];
  gitBranches: GitBranchCandidates;
  openPullRequests?: readonly OpenPullRequest[];
}

export function buildWorktreeCandidates({
  project,
  repoWorkspaceId,
  workspaces,
  gitWorktrees,
  gitBranches,
  openPullRequests = [],
}: BuildWorktreeCandidateOptions): WorktreeCandidate[] {
  const seenBranches = new Set<string>();
  const seenPaths = new Set<string>();
  const candidates: WorktreeCandidate[] = [];

  for (const workspace of workspaces) {
    const worktree = workspace.worktree;
    const branch = worktree?.branch;
    if (!worktree || !branch) continue;
    if (!matchesProject(workspace, project, repoWorkspaceId)) continue;

    const path = worktree.checkout_path ?? worktree.path ?? workspace.cwd;
    const candidate: WorktreeCandidate = {
      id: `workspace:${workspace.workspace_id}`,
      kind: "workspace",
      label: `existing workspace  ${branch}`,
      branch,
      path,
      workspaceId: workspace.workspace_id,
    };
    candidates.push(candidate);
    seenBranches.add(branch);
    if (path) seenPaths.add(normalizePath(path));
  }

  for (const worktree of gitWorktrees) {
    if (!worktree.branch) continue;
    const normalizedPath = normalizePath(worktree.path);
    if (seenPaths.has(normalizedPath)) continue;
    const candidate: WorktreeCandidate = {
      id: `worktree:${worktree.branch}:${worktree.path}`,
      kind: "worktree",
      label: `existing checkout   ${worktree.branch}`,
      branch: worktree.branch,
      path: worktree.path,
    };
    candidates.push(candidate);
    seenBranches.add(worktree.branch);
    seenPaths.add(normalizedPath);
  }

  // PRs appear before local branches in the list, but must still hide when a
  // local `pr-N` already exists (workspace/checkout/local 1:1 identity).
  const branchesRepresentingPr = new Set(seenBranches);
  for (const branch of gitBranches.local) {
    branchesRepresentingPr.add(branch);
  }

  for (const pr of openPullRequests) {
    const branch = pullRequestBranchName(pr.number);
    if (branchesRepresentingPr.has(branch)) continue;
    candidates.push({
      id: `pr:${pr.number}`,
      kind: "pull-request",
      label: openPullRequestLabel(pr),
      branch,
      prNumber: pr.number,
      title: pr.title,
      headRefName: pr.headRefName,
      headOwner: pr.headOwner,
      isDraft: pr.isDraft,
      isCrossRepository: pr.isCrossRepository,
      author: pr.author,
      headRepositoryNameWithOwner: pr.headRepositoryNameWithOwner,
      baseRefName: pr.baseRefName,
      additions: pr.additions,
      deletions: pr.deletions,
      previewPath: project,
    });
    seenBranches.add(branch);
    branchesRepresentingPr.add(branch);
  }

  for (const branch of gitBranches.local) {
    if (seenBranches.has(branch)) continue;
    candidates.push({
      id: `local:${branch}`,
      kind: "local-branch",
      label: `local branch        ${branch}`,
      branch,
      previewPath: project,
    });
    seenBranches.add(branch);
  }

  for (const remote of gitBranches.remote) {
    const branch = localBranchNameFromRemote(remote);
    if (!branch || seenBranches.has(branch)) continue;
    candidates.push({
      id: `remote:${remote}`,
      kind: "remote-branch",
      label: `remote branch       ${remote}`,
      branch,
      base: remote,
      previewPath: project,
    });
    seenBranches.add(branch);
  }

  return candidates;
}

export function pullRequestBranchName(prNumber: number): string {
  return `pr-${prNumber}`;
}

/**
 * Human-meaningful herdr workspace label for a materialized PR, e.g.
 * `pr-29-fix_worktree_gate`. The git branch stays `pr-{n}`; this only names
 * the workspace.
 */
export function pullRequestWorkspaceLabel(
  prNumber: number,
  title: string
): string {
  const short = slugifyTitle(title, PR_WORKSPACE_LABEL_SEGMENT_MAX);
  return [`pr-${prNumber}`, short].filter(Boolean).join("-");
}

const PR_WORKSPACE_LABEL_SEGMENT_MAX = 24;

function slugifySegment(value: string, max: number): string {
  const slug = value
    .split(/[^a-zA-Z0-9_-]+/)
    .filter(Boolean)
    .join("_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastSeparator = cut.lastIndexOf("_");
  // Back off to a word boundary when it's not too far back.
  return lastSeparator > max * 0.6
    ? cut.slice(0, lastSeparator)
    : cut.replace(/_+$/, "");
}

function slugifyTitle(value: string, max: number): string {
  const words = value.split(/\s+/).filter(Boolean).slice(0, 4);
  return slugifySegment(words.join("_"), max);
}

export function openPullRequestLabel(pr: OpenPullRequest): string {
  const title = sanitizePullRequestTitle(pr.title);
  const badges = [pr.isDraft ? "draft" : "", pr.isCrossRepository ? "fork" : ""]
    .filter(Boolean)
    .join(" ");
  const badgeSuffix = badges ? `  [${badges}]` : "";
  return `open pr  #${pr.number}${badgeSuffix}  ${title}  ${pr.headOwner}:${pr.headRefName}`;
}

export function parseOpenPullRequests(json: string): OpenPullRequest[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const pullRequests: OpenPullRequest[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const number = record.number;
    const title = record.title;
    const headRefName = record.headRefName;
    if (
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      number <= 0 ||
      typeof title !== "string" ||
      typeof headRefName !== "string" ||
      headRefName.length === 0
    ) {
      continue;
    }

    const headOwner = headOwnerFromPrJson(record);
    if (!headOwner) continue;

    pullRequests.push({
      number,
      title,
      headRefName,
      headOwner,
      isDraft: typeof record.isDraft === "boolean" ? record.isDraft : undefined,
      isCrossRepository:
        typeof record.isCrossRepository === "boolean"
          ? record.isCrossRepository
          : undefined,
      author: loginFromJson(record.author),
      headRepositoryNameWithOwner: repositoryNameWithOwnerFromJson(
        record.headRepository
      ),
      baseRefName:
        typeof record.baseRefName === "string" ? record.baseRefName : undefined,
      additions:
        typeof record.additions === "number" ? record.additions : undefined,
      deletions:
        typeof record.deletions === "number" ? record.deletions : undefined,
    });
  }
  return pullRequests;
}

function pullRequestMeta(
  candidate: Extract<WorktreeCandidate, { kind: "pull-request" }>
): string {
  const parts: string[] = [];
  if (candidate.author) parts.push(`author: ${candidate.author}`);
  if (candidate.headRepositoryNameWithOwner) {
    const kind = candidate.isCrossRepository ? "fork" : "repo";
    parts.push(`${kind}: ${candidate.headRepositoryNameWithOwner}`);
  }
  return parts.join(" | ");
}

export function worktreeCandidateRow(candidate: WorktreeCandidate): string {
  const detail =
    candidate.kind === "remote-branch" ? `base: ${candidate.base}` : "";
  return [
    candidate.id,
    candidate.label,
    detail,
    candidate.kind,
    candidate.branch,
    candidatePreviewPath(candidate),
    candidate.kind === "pull-request" ? pullRequestMeta(candidate) : "",
  ].join(WORKTREE_CANDIDATE_ROW_DELIMITER);
}

function candidatePreviewPath(candidate: WorktreeCandidate): string {
  if (candidate.kind === "workspace" || candidate.kind === "worktree") {
    return candidate.path ?? "";
  }
  return candidate.previewPath;
}

async function listOpenPullRequestsSoft(
  runtime: WorktreeCandidateRuntime,
  project: string
): Promise<OpenPullRequest[]> {
  try {
    return await runtime.listOpenPullRequests(project);
  } catch {
    return [];
  }
}

function loginFromJson(value: unknown): string | undefined {
  if (value && typeof value === "object") {
    const login = (value as Record<string, unknown>).login;
    if (typeof login === "string" && login.length > 0) return login;
  }
  return undefined;
}

function repositoryNameWithOwnerFromJson(value: unknown): string | undefined {
  if (value && typeof value === "object") {
    const nameWithOwner = (value as Record<string, unknown>).nameWithOwner;
    if (typeof nameWithOwner === "string" && nameWithOwner.length > 0) {
      return nameWithOwner;
    }
  }
  return undefined;
}

function headOwnerFromPrJson(
  record: Record<string, unknown>
): string | undefined {
  const headRepositoryOwner = record.headRepositoryOwner;
  const fromOwner = loginFromJson(headRepositoryOwner);
  if (fromOwner) return fromOwner;
  return loginFromJson(record.author);
}

function sanitizePullRequestTitle(title: string): string {
  return title.replace(/[\t\r\n]+/g, " ").trim();
}

export function worktreeCandidatePreviewPath(row: string): string | undefined {
  const path = row.split(WORKTREE_CANDIDATE_ROW_DELIMITER)[5];
  return path && path.length > 0 ? path : undefined;
}

export function worktreeCandidateVisibleRow(row: string): string {
  return row
    .split(WORKTREE_CANDIDATE_ROW_DELIMITER)
    .slice(1, 3)
    .filter((value) => value.length > 0)
    .join(WORKTREE_CANDIDATE_ROW_DELIMITER);
}

export function worktreeCandidateFromRow(
  row: string,
  candidates: readonly WorktreeCandidate[]
): WorktreeCandidate | undefined {
  const id = row.split(WORKTREE_CANDIDATE_ROW_DELIMITER)[0];
  return candidates.find((candidate) => candidate.id === id);
}

export function parseGitWorktreePorcelain(
  porcelain: string
): GitWorktreeCandidate[] {
  const worktrees: GitWorktreeCandidate[] = [];
  let current: GitWorktreeCandidate | undefined;

  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) worktrees.push(current);
      current = { path: line.slice("worktree ".length).trim() };
      continue;
    }

    if (line.startsWith("branch ") && current) {
      const ref = line.slice("branch ".length).trim();
      current.branch = ref.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : ref;
    }
  }

  if (current) worktrees.push(current);
  return worktrees;
}

export function parseGitBranchLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith("/HEAD"));
}

function matchesProject(
  workspace: Workspace,
  project: string,
  repoWorkspaceId: string | undefined
): boolean {
  const worktree = workspace.worktree;
  if (!worktree) return false;
  if (repoWorkspaceId && worktree.repo_workspace_id === repoWorkspaceId) {
    return true;
  }
  return normalizePath(worktree.repo_root) === normalizePath(project);
}

function localBranchNameFromRemote(remote: string): string | undefined {
  const slash = remote.indexOf("/");
  if (slash === -1) return undefined;
  const branch = remote.slice(slash + 1);
  return branch.length > 0 ? branch : undefined;
}

const defaultWorktreeCandidateRuntime: WorktreeCandidateRuntime = {
  async listGitWorktrees(project) {
    const result = await runGit(project, ["worktree", "list", "--porcelain"]);
    if (result.exitCode !== 0) return [];
    return parseGitWorktreePorcelain(result.stdout).filter(
      (worktree) => normalizePath(worktree.path) !== normalizePath(project)
    );
  },
  async listGitBranches(project) {
    const [local, remote] = await Promise.all([
      runGit(project, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
      ]),
      runGit(project, [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/remotes",
      ]),
    ]);
    return {
      local: local.exitCode === 0 ? parseGitBranchLines(local.stdout) : [],
      remote: remote.exitCode === 0 ? parseGitBranchLines(remote.stdout) : [],
    };
  },
  async listOpenPullRequests(project) {
    const result = await runGh(project, [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "30",
      "--json",
      "number,title,headRefName,headRepositoryOwner,author,headRepository,isDraft,isCrossRepository,baseRefName,additions,deletions",
    ]);
    if (result.exitCode !== 0) return [];
    return parseOpenPullRequests(result.stdout);
  },
};

/**
 * Materializes a pull request head as a local `pr-{n}` branch and configures
 * an upstream so `git pull` works inside the created worktree.
 *
 * The PR head ref (`refs/pull/{n}/head`) lives outside the normal
 * `refs/heads/*` namespace, so git cannot infer tracking from the fetch
 * refspec. GitHub serves `refs/pull/{n}/head` on `origin` for every open PR
 * (redirecting to the contributor's fork head for cross-fork PRs), so point
 * `branch.<name>.merge` at it directly — no fork remote needed. Config is
 * written to the main repo and shared by its worktrees.
 */
export async function fetchPullRequestHead(
  project: string,
  prNumber: number,
  branch: string = pullRequestBranchName(prNumber)
): Promise<void> {
  const refspec = `pull/${prNumber}/head:refs/heads/${branch}`;
  const result = await runGit(project, ["fetch", "origin", refspec]);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      detail || `git fetch failed for pull request #${prNumber} (${refspec})`
    );
  }
  const upstream: ReadonlyArray<readonly [string, string]> = [
    [`branch.${branch}.remote`, "origin"],
    [`branch.${branch}.merge`, `refs/pull/${prNumber}/head`],
  ];
  for (const [key, value] of upstream) {
    const config = await runGit(project, ["config", key, value]);
    if (config.exitCode !== 0) {
      const detail = config.stderr.trim() || config.stdout.trim();
      throw new Error(
        detail || `git config ${key} failed for pull request #${prNumber}`
      );
    }
  }
}

async function runGit(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    // The project repo is always the one at `cwd`; ignore ambient git env
    // (e.g. GIT_DIR exported by git hooks) that could redirect git elsewhere.
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LANG: process.env.LANG,
    },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function runGh(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const proc = Bun.spawn(["gh", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  } catch {
    // Missing `gh` binary or spawn failure — soft skip.
    return { stdout: "", stderr: "", exitCode: 127 };
  }
}
