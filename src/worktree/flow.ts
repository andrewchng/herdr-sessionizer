import { normalizePath, sanitizeName } from "../discovery/discovery.ts";

import { HerdrError } from "../client/errors.ts";
import type { Workspace } from "../client/types.ts";
import type { SessionizerConfig } from "../config/config.ts";
import { resolveLayoutConfig } from "../config/config.ts";
import type { PickOptions } from "../ui/fzf.ts";
import { PROJECT_PREVIEW, WORKTREE_CANDIDATE_PREVIEW } from "../ui/previews.ts";
import type { WorktreeResolver } from "./resolver.ts";
import type { Worktrees, WorktreeOpenResult } from "../ops/worktrees.ts";
import type {
  DiscoverWorktreeCandidateOptions,
  WorktreeCandidate,
} from "./candidates.ts";
import {
  WORKTREE_CANDIDATE_ROW_DELIMITER,
  discoverWorktreeCandidates,
  fetchPullRequestHead,
  pullRequestWorkspaceLabel,
  worktreeCandidateFromRow,
  worktreeCandidateRow,
} from "./candidates.ts";

interface CliArgs {
  project?: string;
  branch?: string;
  base?: string;
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
  listProjects: (
    roots: string[],
    options?: SessionizerConfig["projects"]
  ) => string[];
  pickProject: PickRows;
  pickWorktreeCandidate: PickRows;
  /** Returns a branch name, or `null` when the user cancels (Esc / Ctrl+C). */
  promptBranch: () => Promise<string | null>;
  discoverCandidates: (
    options: DiscoverWorktreeCandidateOptions
  ) => Promise<WorktreeCandidate[]>;
  attachExistingBranch: (project: string, branch: string) => Promise<string>;
  localBranchExists: (project: string, branch: string) => Promise<boolean>;
  fetchPullRequestHead: (
    project: string,
    prNumber: number,
    branch: string
  ) => Promise<void>;
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
    }
  | {
      kind: "create-pull-request";
      project: string;
      branch: string;
      prNumber: number;
      label: string;
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
          base: args.base,
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
    const opened = await runtime.worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : intent.project,
      path: intent.path,
      focus: true,
    });
    await bootstrapOpenedWorktree(runtime, opened, {
      branch: intent.branch,
      fallbackPath: intent.path,
      openedMessage: `✓ opened existing worktree path '${intent.path}' for '${intent.branch}'`,
    });
    return;
  }

  if (intent.kind === "create-pull-request") {
    await runtime.fetchPullRequestHead(
      intent.project,
      intent.prNumber,
      intent.branch
    );
    await openOrCreateWorktree(runtime, {
      project: intent.project,
      branch: intent.branch,
      label: intent.label,
      command,
      repoWorkspaceId,
    });
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
  const projects = runtime.listProjects(
    runtime.config.projects.roots,
    runtime.config.projects
  );
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
      withNth: "2,3",
      preview: WORKTREE_CANDIDATE_PREVIEW,
      previewWindow: "right:50%",
    });

    if (picked && picked.length > 0) {
      const candidate = worktreeCandidateFromRow(picked[0]!, candidates);
      if (!candidate) {
        throw new Error("Selected worktree candidate was not recognized.");
      }
      return intentFromCandidate(project, candidate);
    }
  }

  const branch = await runtime.promptBranch();
  if (branch === null) return { kind: "cancelled" };

  return {
    kind: "create-branch",
    project,
    branch,
  };
}

export function intentFromCandidate(
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

  if (candidate.kind === "pull-request") {
    return {
      kind: "create-pull-request",
      project,
      branch: candidate.branch,
      prNumber: candidate.prNumber,
      label: pullRequestWorkspaceLabel(candidate.prNumber, candidate.title),
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
    label?: string;
    command?: string;
    repoWorkspaceId?: string;
  }
): Promise<void> {
  const {
    project,
    branch,
    base,
    label: labelOverride,
    command,
    repoWorkspaceId,
  } = options;
  if (!branch) {
    throw new Error("Branch name cannot be empty.");
  }
  if (/\s/.test(branch)) {
    throw new Error("Branch name cannot contain spaces.");
  }

  try {
    const opened = await runtime.worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      branch,
      focus: true,
    });
    await bootstrapOpenedWorktree(runtime, opened, {
      branch,
      command,
      fallbackPath: project,
      openedMessage: `✓ opened existing worktree '${branch}'`,
    });
    return;
  } catch (error) {
    if (!asHerdrError(error)) throw error;
  }

  const label = labelOverride ?? sanitizeName(branch);
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
    const branchExists = await runtime.localBranchExists(project, branch);
    const existing = await runtime.resolver.resolveExisting({
      project,
      branch,
      error: herdrError,
      branchExists,
    });
    if (existing) {
      const opened = await runtime.worktrees.open({
        workspaceId: repoWorkspaceId,
        cwd: repoWorkspaceId ? undefined : project,
        path: existing.path,
        focus: true,
      });
      await bootstrapOpenedWorktree(runtime, opened, {
        branch,
        command,
        fallbackPath: existing.path,
        openedMessage: `✓ opened existing worktree path '${existing.path}' for '${branch}'`,
      });
      return;
    }
    if (!branchExists) throw herdrError;

    const path = await runtime.attachExistingBranch(project, branch);
    const reopened = await runtime.worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      path,
      label,
      focus: false,
    });
    await bootstrapOpenedWorktree(runtime, reopened, {
      branch,
      command,
      fallbackPath: path,
      openedMessage: `✓ attached existing branch '${branch}' at '${path}'`,
      verb: "created",
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
    verb?: "created" | "opened";
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
  const verb = options.verb ?? "created";
  runtime.logger.log(
    `✓ worktree '${options.branch}' ${verb} and focused (${workspace.workspace_id})`
  );
}

async function bootstrapOpenedWorktree(
  runtime: WorktreeFlowRuntime,
  opened: WorktreeOpenResult,
  options: {
    branch: string;
    command?: string;
    fallbackPath: string;
    openedMessage: string;
    verb?: "created" | "opened";
  }
): Promise<void> {
  if (opened.workspace && !opened.alreadyOpen) {
    await bootstrapWorktree(runtime, opened.workspace, {
      layoutFallback: opened.worktreePath ?? options.fallbackPath,
      branch: options.branch,
      command: options.command,
      verb: options.verb ?? "opened",
    });
    return;
  }
  // Reattach of an already-open workspace: focus only, never relayout
  // (ADR-0001). Idempotent where `worktree open --focus` already focused.
  if (opened.workspace) {
    await runtime.workspaces.focus(opened.workspace.workspace_id);
  }
  runtime.logger.log(options.openedMessage);
}

function parseArgs(argv: readonly string[]): CliArgs {
  let project: string | undefined;
  let branch: string | undefined;
  let base: string | undefined;
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
    if (arg === "--base") {
      base = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--command" || arg === "-c" || arg === "--context") {
      command = argv[index + 1];
      index += 1;
    }
  }

  return { project, branch, base, command };
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

export const defaultDiscoverWorktreeCandidates = discoverWorktreeCandidates;
