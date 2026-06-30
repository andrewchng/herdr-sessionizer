import type { Workspace } from "./client/types.ts";
import { normalizePath } from "./discovery.ts";

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
      kind: "local-branch";
      label: string;
      branch: string;
    }
  | {
      id: string;
      kind: "remote-branch";
      label: string;
      branch: string;
      base: string;
    };

export interface GitWorktreeCandidate {
  path: string;
  branch?: string;
}

export interface GitBranchCandidates {
  local: string[];
  remote: string[];
}

export interface WorktreeCandidateRuntime {
  listGitWorktrees(project: string): Promise<GitWorktreeCandidate[]>;
  listGitBranches(project: string): Promise<GitBranchCandidates>;
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
  const [gitWorktrees, gitBranches] = await Promise.all([
    runtime.listGitWorktrees(project),
    runtime.listGitBranches(project),
  ]);
  return buildWorktreeCandidates({
    project,
    repoWorkspaceId,
    workspaces,
    gitWorktrees,
    gitBranches,
  });
}

export interface BuildWorktreeCandidateOptions {
  project: string;
  repoWorkspaceId?: string;
  workspaces: readonly Workspace[];
  gitWorktrees: readonly GitWorktreeCandidate[];
  gitBranches: GitBranchCandidates;
}

export function buildWorktreeCandidates({
  project,
  repoWorkspaceId,
  workspaces,
  gitWorktrees,
  gitBranches,
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

  for (const branch of gitBranches.local) {
    if (seenBranches.has(branch)) continue;
    candidates.push({
      id: `local:${branch}`,
      kind: "local-branch",
      label: `local branch        ${branch}`,
      branch,
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
    });
    seenBranches.add(branch);
  }

  return candidates;
}

export function worktreeCandidateRow(candidate: WorktreeCandidate): string {
  const detail =
    candidate.kind === "workspace" || candidate.kind === "worktree"
      ? (candidate.path ?? "")
      : candidate.kind === "remote-branch"
        ? `base: ${candidate.base}`
        : "";
  return [candidate.id, candidate.label, detail].join(
    WORKTREE_CANDIDATE_ROW_DELIMITER
  );
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
};

async function runGit(
  cwd: string,
  args: string[]
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, , exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, exitCode };
}
