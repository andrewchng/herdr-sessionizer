import { normalizePath, sanitizeName } from "./discovery.ts";

import { HerdrError } from "./client/errors.ts";
import type { Workspace } from "./client/types.ts";
import type { SessionizerConfig } from "./config.ts";
import { resolveLayoutConfig } from "./config.ts";
import type { PickOptions } from "./ui/fzf.ts";
import { PROJECT_PREVIEW } from "./ui/previews.ts";
import type { WorktreeResolver } from "./worktree-resolver.ts";
import type { Worktrees } from "./ops/worktrees.ts";
import type {
  DiscoverWorktreeCandidateOptions,
  WorktreeCandidate,
} from "./worktree-candidates.ts";
import {
  WORKTREE_CANDIDATE_ROW_DELIMITER,
  discoverWorktreeCandidates,
  worktreeCandidateFromRow,
  worktreeCandidateRow,
} from "./worktree-candidates.ts";

interface CliArgs {
  project?: string;
  branch?: string;
  command?: string;
}

type LayoutApplier = (
  workspace: Workspace,
  cwd: string,
  config: SessionizerConfig,
  tabs: unknown,
  panes: unknown,
  options?: {
    commandOverride?: string;
    branch?: string;
  }
) => Promise<Workspace>;

interface WorktreeWorkspaceRuntime {
  list(): Promise<Workspace[]>;
  get(workspaceId: string): Promise<Workspace | undefined>;
  focus(workspaceId: string): Promise<void>;
}

interface WorktreeServiceRuntime {
  open: Worktrees["open"];
  create: Worktrees["create"];
}

type PickRows = (
  rows: readonly string[],
  options?: PickOptions
) => Promise<string[] | null>;

export interface WorktreeFlowRuntime {
  worktrees: WorktreeServiceRuntime;
  workspaces: WorktreeWorkspaceRuntime;
  tabs: unknown;
  panes: unknown;
  config: SessionizerConfig;
  resolver: Pick<WorktreeResolver, "resolveExisting">;
  createLayout: LayoutApplier;
  listProjects: (roots: string[]) => string[];
  pickProject: PickRows;
  pickWorktreeCandidate: PickRows;
  promptBranch: () => Promise<string>;
  discoverCandidates: (
    options: DiscoverWorktreeCandidateOptions
  ) => Promise<WorktreeCandidate[]>;
  attachExistingBranch: (project: string, branch: string) => Promise<string>;
  logger: Pick<typeof console, "log" | "error">;
  exit: (code: number) => never;
}

type WorktreeIntent =
  | {
      kind: "cancelled";
    }
  | {
      kind: "open-workspace";
      project: string;
      workspaceId: string;
      branch: string;
    }
  | {
      kind: "open-worktree";
      project: string;
      path: string;
      branch: string;
    }
  | {
      kind: "create-branch";
      project: string;
      branch: string;
      base?: string;
    };

export async function runWorktreeFlow(
  argv: readonly string[],
  runtime: WorktreeFlowRuntime
): Promise<void> {
  const args = parseArgs(argv);
  const command = args.command;

  if ((args.project && !args.branch) || (!args.project && args.branch)) {
    throw new Error(
      "Use both project and branch together, or use neither for interactive mode."
    );
  }

  const workspaces = await runtime.workspaces.list();
  const intent =
    args.project && args.branch
      ? {
          kind: "create-branch" as const,
          project: args.project,
          branch: args.branch,
        }
      : await resolveInteractiveIntent(runtime, workspaces);

  if (intent.kind === "cancelled") return;

  if (intent.kind === "open-workspace") {
    await runtime.workspaces.focus(intent.workspaceId);
    runtime.logger.log(
      `✓ focused existing worktree workspace '${intent.branch}'`
    );
    return;
  }

  const repoWorkspaceId = findRepoWorkspaceId(workspaces, intent.project);

  if (intent.kind === "open-worktree") {
    await runtime.worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : intent.project,
      path: intent.path,
      focus: true,
    });
    runtime.logger.log(
      `✓ opened existing worktree path '${intent.path}' for '${intent.branch}'`
    );
    return;
  }

  await openOrCreateWorktree(runtime, {
    project: intent.project,
    branch: intent.branch,
    base: intent.base,
    command,
    repoWorkspaceId,
  });
}

async function resolveInteractiveIntent(
  runtime: WorktreeFlowRuntime,
  workspaces: readonly Workspace[]
): Promise<WorktreeIntent> {
  const projects = runtime.listProjects(runtime.config.projects.roots);
  if (projects.length === 0) {
    runtime.logger.error("No projects found in configured directories.");
    runtime.exit(1);
  }

  const selected = await runtime.pickProject(projects, {
    prompt: "Base project for worktree: ",
    header: "Select a repo to spin off a worktree workspace",
    preview: PROJECT_PREVIEW,
    previewWindow: "right:50%",
  });

  if (!selected || selected.length === 0) return { kind: "cancelled" };

  const project = selected[0]!;
  const repoWorkspaceId = findRepoWorkspaceId(workspaces, project);
  const candidates = await runtime.discoverCandidates({
    project,
    repoWorkspaceId,
    workspaces,
  });
  if (candidates.length > 0) {
    const rows = candidates.map(worktreeCandidateRow);
    const picked = await runtime.pickWorktreeCandidate(rows, {
      prompt: "Worktree branch (Esc for new): ",
      header:
        "Enter opens existing or creates from branch; Esc creates a new branch",
      delimiter: WORKTREE_CANDIDATE_ROW_DELIMITER,
      withNth: "2..",
    });

    if (picked && picked.length > 0) {
      const candidate = worktreeCandidateFromRow(picked[0]!, candidates);
      if (!candidate) {
        throw new Error("Selected worktree candidate was not recognized.");
      }
      return intentFromCandidate(project, candidate);
    }
  }

  return {
    kind: "create-branch",
    project,
    branch: await runtime.promptBranch(),
  };
}

function intentFromCandidate(
  project: string,
  candidate: WorktreeCandidate
): WorktreeIntent {
  if (candidate.kind === "workspace") {
    return {
      kind: "open-workspace",
      project,
      workspaceId: candidate.workspaceId,
      branch: candidate.branch,
    };
  }

  if (candidate.kind === "worktree") {
    return {
      kind: "open-worktree",
      project,
      path: candidate.path,
      branch: candidate.branch,
    };
  }

  if (candidate.kind === "remote-branch") {
    return {
      kind: "create-branch",
      project,
      branch: candidate.branch,
      base: candidate.base,
    };
  }

  return {
    kind: "create-branch",
    project,
    branch: candidate.branch,
  };
}

async function openOrCreateWorktree(
  runtime: WorktreeFlowRuntime,
  options: {
    project: string;
    branch: string;
    base?: string;
    command?: string;
    repoWorkspaceId?: string;
  }
): Promise<void> {
  const { project, branch, base, command, repoWorkspaceId } = options;
  if (!branch) {
    throw new Error("Branch name cannot be empty.");
  }
  if (/\s/.test(branch)) {
    throw new Error("Branch name cannot contain spaces.");
  }

  try {
    await runtime.worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      branch,
      focus: true,
    });
    runtime.logger.log(`✓ opened existing worktree '${branch}'`);
    return;
  } catch (error) {
    if (!asHerdrError(error)) throw error;
  }

  const label = sanitizeName(branch);
  let workspace: Workspace;
  try {
    workspace = await runtime.worktrees.create({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      branch,
      base,
      label,
      focus: false,
    });
  } catch (error) {
    const herdrError = asHerdrError(error);
    if (!herdrError) throw error;
    const existing = await runtime.resolver.resolveExisting({
      project,
      branch,
      error: herdrError,
    });
    if (existing) {
      await runtime.worktrees.open({
        workspaceId: repoWorkspaceId,
        cwd: repoWorkspaceId ? undefined : project,
        path: existing.path,
        focus: true,
      });
      runtime.logger.log(
        `✓ opened existing worktree path '${existing.path}' for '${branch}'`
      );
      return;
    }
    if (!isDuplicateBranchError(herdrError)) throw herdrError;

    const path = await runtime.attachExistingBranch(project, branch);
    const reopened = await runtime.worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      path,
      label,
      focus: false,
    });
    const reopenedWorkspace = reopened.workspace;
    if (!reopenedWorkspace) {
      throw new Error(
        `worktree open succeeded but no workspace was returned for '${path}'`
      );
    }

    await bootstrapWorktree(runtime, reopenedWorkspace, {
      layoutFallback: reopened.worktreePath ?? path,
      branch,
      command,
    });
    return;
  }

  await bootstrapWorktree(runtime, workspace, {
    layoutFallback: project,
    branch,
    command,
  });
}

async function bootstrapWorktree(
  runtime: WorktreeFlowRuntime,
  workspace: Workspace,
  options: {
    layoutFallback: string;
    branch: string;
    command?: string;
  }
): Promise<void> {
  const layoutCwd = await resolveLayoutCwd(
    runtime.workspaces,
    workspace,
    options.layoutFallback
  );
  const layoutConfig = resolveLayoutConfig(layoutCwd, runtime.config);
  await runtime.createLayout(
    workspace,
    layoutCwd,
    layoutConfig,
    runtime.tabs,
    runtime.panes,
    {
      commandOverride: options.command,
      branch: options.branch,
    }
  );
  await runtime.workspaces.focus(workspace.workspace_id);
  runtime.logger.log(
    `✓ worktree '${options.branch}' created and focused (${workspace.workspace_id})`
  );
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let project: string | undefined;
  let branch: string | undefined;
  let command: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project" || arg === "-p") {
      project = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--branch" || arg === "-b") {
      branch = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--command" || arg === "-c" || arg === "--context") {
      command = argv[index + 1];
      index += 1;
    }
  }

  return { project, branch, command };
}

function findRepoWorkspaceId(
  workspaces: readonly Workspace[],
  projectPath: string
): string | undefined {
  const normalizedProject = normalizePath(projectPath);
  return workspaces.find(
    (workspace) =>
      !workspace.worktree && normalizePath(workspace.cwd) === normalizedProject
  )?.workspace_id;
}

function worktreeCheckoutPath(
  workspace: Workspace | undefined
): string | undefined {
  return workspace?.worktree?.checkout_path ?? workspace?.worktree?.path;
}

async function resolveLayoutCwd(
  workspaces: Pick<WorktreeWorkspaceRuntime, "get">,
  workspace: Workspace,
  fallback: string
): Promise<string> {
  const current = await workspaces.get(workspace.workspace_id);
  return (
    worktreeCheckoutPath(current) ??
    current?.cwd ??
    worktreeCheckoutPath(workspace) ??
    workspace.cwd ??
    fallback
  );
}

function asHerdrError(error: unknown): HerdrError | undefined {
  if (error instanceof HerdrError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof (error as { stderr: unknown }).stderr === "string"
  ) {
    return error as HerdrError;
  }
  return undefined;
}

function isDuplicateBranchError(error: HerdrError): boolean {
  return error.stderr.includes("a branch named");
}

export const defaultDiscoverWorktreeCandidates = discoverWorktreeCandidates;
