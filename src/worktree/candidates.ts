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

export function openPullRequestLabel(pr: OpenPullRequest): string {
  const title = sanitizePullRequestTitle(pr.title);
  return `open pr  #${pr.number}  ${title}  ${pr.headOwner}:${pr.headRefName}`;
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
    });
  }
  return pullRequests;
}

export function worktreeCandidateRow(candidate: WorktreeCandidate): string {
  const detail =
    candidate.kind === "remote-branch"
      ? `base: ${candidate.base}`
      : candidate.kind === "pull-request"
        ? `pr #${candidate.prNumber} → ${candidate.branch} | pull/${candidate.prNumber}/head`
        : "";
  return [
    candidate.id,
    candidate.label,
    detail,
    candidate.kind,
    candidate.branch,
    candidatePreviewPath(candidate),
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

function headOwnerFromPrJson(
  record: Record<string, unknown>
): string | undefined {
  const headRepositoryOwner = record.headRepositoryOwner;
  if (
    headRepositoryOwner &&
    typeof headRepositoryOwner === "object" &&
    typeof (headRepositoryOwner as { login?: unknown }).login === "string" &&
    (headRepositoryOwner as { login: string }).login.length > 0
  ) {
    return (headRepositoryOwner as { login: string }).login;
  }

  const author = record.author;
  if (
    author &&
    typeof author === "object" &&
    typeof (author as { login?: unknown }).login === "string" &&
    (author as { login: string }).login.length > 0
  ) {
    return (author as { login: string }).login;
  }

  return undefined;
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
      "number,title,headRefName,headRepositoryOwner,author,isDraft,isCrossRepository",
    ]);
    if (result.exitCode !== 0) return [];
    return parseOpenPullRequests(result.stdout);
  },
};

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
}

async function runGit(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
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
