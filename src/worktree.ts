import { listProjects, sanitizeName, normalizePath } from './discovery.ts';

import { Herdr } from './client/herdr.ts';
import { HerdrError } from './client/errors.ts';
import type { SessionizerConfig } from './config.ts';
import type { Workspace } from './client/types.ts';
import { loadConfig } from './config.ts';
import { createProjectLayout } from './layouts/project.ts';
import { Panes } from './ops/panes.ts';
import { Tabs } from './ops/tabs.ts';
import { Workspaces } from './ops/workspaces.ts';
import { Worktrees } from './ops/worktrees.ts';
import { pick } from './ui/fzf.ts';
import { promptText } from './ui/prompt.ts';
import { attachExistingBranchWorktree } from './worktree-branch-fallback.ts';
import { WorktreeResolver } from './worktree-resolver.ts';

interface CliArgs {
  project?: string;
  branch?: string;
  context?: string;
}

type LayoutApplier = (
  workspace: Workspace,
  cwd: string,
  config: SessionizerConfig,
  tabs: unknown,
  panes: unknown,
  options?: {
    commandContext?: string;
    branch?: string;
  },
) => Promise<Workspace>;

interface WorktreeWorkspaceRuntime {
  list(): Promise<Workspace[]>;
  get(workspaceId: string): Promise<Workspace | undefined>;
  focus(workspaceId: string): Promise<void>;
}

interface WorktreeServiceRuntime {
  open: Worktrees['open'];
  create: Worktrees['create'];
}

interface WorktreeRuntime {
  worktrees: WorktreeServiceRuntime;
  workspaces: WorktreeWorkspaceRuntime;
  tabs: unknown;
  panes: unknown;
  config: SessionizerConfig;
  resolver: Pick<WorktreeResolver, 'resolveExisting'>;
  createLayout: LayoutApplier;
  pickProject: typeof pick;
  promptBranch: () => Promise<string>;
  attachExistingBranch: (project: string, branch: string) => Promise<string>;
  logger: Pick<typeof console, 'log' | 'error'>;
  exit: (code: number) => never;
}

export async function runWorktree(
  argv: readonly string[] = process.argv.slice(2),
  runtime: WorktreeRuntime = createRuntime(),
): Promise<void> {
  const args = parseArgs(argv);
  const { worktrees, workspaces, tabs, panes, config, resolver } = runtime;

  let project = args.project;
  let branch = args.branch;
  const context = args.context;

  if ((project && !branch) || (!project && branch)) {
    throw new Error('Use both project and branch together, or use neither for interactive mode.');
  }

  if (!project && !branch) {
    const projects = listProjects(config.projects.roots);
    if (projects.length === 0) {
      runtime.logger.error('No projects found in configured directories.');
      runtime.exit(1);
    }

    const selected = await runtime.pickProject(projects, {
      prompt: 'Base project for worktree: ',
      header: 'Select a repo to spin off a worktree workspace',
    });

    if (!selected || selected.length === 0) return;

    project = selected[0]!;
    branch = await runtime.promptBranch();
  }

  if (!project || !branch) return;
  if (/\s/.test(branch)) {
    throw new Error('Branch name cannot contain spaces.');
  }

  const label = sanitizeName(branch);
  const repoWorkspaceId = findRepoWorkspaceId(await workspaces.list(), project);

  try {
    await worktrees.open({
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

  let workspace: Workspace;
  try {
    workspace = await worktrees.create({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      branch,
      label,
      focus: false,
    });
  } catch (error) {
    const herdrError = asHerdrError(error);
    if (!herdrError) throw error;
    const existing = await resolver.resolveExisting({ project, branch, error: herdrError });
    if (existing) {
      await worktrees.open({
        workspaceId: repoWorkspaceId,
        cwd: repoWorkspaceId ? undefined : project,
        path: existing.path,
        focus: true,
      });
      runtime.logger.log(`✓ opened existing worktree path '${existing.path}' for '${branch}'`);
      return;
    }
    if (!isDuplicateBranchError(herdrError)) throw herdrError;

    const path = await runtime.attachExistingBranch(project, branch);
    const reopened = await worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      path,
      label,
      focus: false,
    });
    const reopenedWorkspace = reopened.workspace;
    if (!reopenedWorkspace) {
      throw new Error(`worktree open succeeded but no workspace was returned for '${path}'`);
    }

    const layoutCwd = await resolveLayoutCwd(workspaces, reopenedWorkspace, reopened.worktreePath ?? path);
    await runtime.createLayout(reopenedWorkspace, layoutCwd, config, tabs, panes, {
      commandContext: context,
      branch,
    });
    await workspaces.focus(reopenedWorkspace.workspace_id);
    runtime.logger.log(`✓ worktree '${branch}' created and focused (${reopenedWorkspace.workspace_id})`);
    return;
  }

  const layoutCwd = await resolveLayoutCwd(workspaces, workspace, project);
  await runtime.createLayout(workspace, layoutCwd, config, tabs, panes, {
    commandContext: context,
    branch,
  });
  await workspaces.focus(workspace.workspace_id);

  runtime.logger.log(`✓ worktree '${branch}' created and focused (${workspace.workspace_id})`);
}

function parseArgs(argv: readonly string[]): CliArgs {
  let project: string | undefined;
  let branch: string | undefined;
  let context: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project' || arg === '-p') {
      project = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--branch' || arg === '-b') {
      branch = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--context' || arg === '-c') {
      context = argv[index + 1];
      index += 1;
    }
  }

  return { project, branch, context };
}

async function promptBranchName(): Promise<string> {
  while (true) {
    const value = await promptText('Branch name: ');
    if (!value) {
      console.error('Branch name cannot be empty.');
      continue;
    }
    if (/\s/.test(value)) {
      console.error('Branch name cannot contain spaces.');
      continue;
    }
    return value;
  }
}

function createRuntime(): WorktreeRuntime {
  const herdr = new Herdr();

  return {
    worktrees: new Worktrees(herdr),
    workspaces: new Workspaces(herdr),
    tabs: new Tabs(herdr),
    panes: new Panes(herdr),
    config: loadConfig(),
    resolver: new WorktreeResolver(),
    createLayout: (workspace, cwd, config, tabs, panes, options) =>
      createProjectLayout(workspace, cwd, config, tabs as Tabs, panes as Panes, options),
    pickProject: pick,
    promptBranch: promptBranchName,
    attachExistingBranch: attachExistingBranchWorktree,
    logger: console,
    exit: (code) => process.exit(code),
  };
}



function findRepoWorkspaceId(workspaces: Workspace[], projectPath: string): string | undefined {
  const normalizedProject = normalizePath(projectPath);
  return workspaces.find((workspace) => !workspace.worktree && normalizePath(workspace.cwd) === normalizedProject)?.workspace_id;
}

function worktreeCheckoutPath(workspace: Workspace | undefined): string | undefined {
  return workspace?.worktree?.checkout_path ?? workspace?.worktree?.path;
}

async function resolveLayoutCwd(
  workspaces: Pick<WorktreeWorkspaceRuntime, 'get'>,
  workspace: Workspace,
  fallback: string,
): Promise<string> {
  const current = await workspaces.get(workspace.workspace_id);
  return worktreeCheckoutPath(current) ?? current?.cwd ?? worktreeCheckoutPath(workspace) ?? workspace.cwd ?? fallback;
}

function asHerdrError(error: unknown): HerdrError | undefined {
  if (error instanceof HerdrError) return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'stderr' in error &&
    typeof (error as { stderr: unknown }).stderr === 'string'
  ) {
    return error as HerdrError;
  }
  return undefined;
}

function isDuplicateBranchError(error: HerdrError): boolean {
  return error.stderr.includes('a branch named');
}
