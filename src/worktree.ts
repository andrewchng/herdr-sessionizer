import { basename, join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

import { listProjects, sanitizeName, normalizePath, worktreeSlug } from './discovery.ts';

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

interface CliArgs {
  project?: string;
  branch?: string;
  context?: string;
}

export async function runWorktree(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const herdr = new Herdr();
  const worktrees = new Worktrees(herdr);
  const workspaces = new Workspaces(herdr);
  const tabs = new Tabs(herdr);
  const panes = new Panes(herdr);
  const config = loadConfig();

  let project = args.project;
  let branch = args.branch;
  const context = args.context;

  if ((project && !branch) || (!project && branch)) {
    throw new Error('Use both project and branch together, or use neither for interactive mode.');
  }

  if (!project && !branch) {
    const projects = listProjects(config.projects.roots);
    if (projects.length === 0) {
      console.error('No projects found in configured directories.');
      process.exit(1);
    }

    const selected = await pick(projects, {
      prompt: 'Base project for worktree: ',
      header: 'Select a repo to spin off a worktree workspace',
    });

    if (!selected || selected.length === 0) return;

    project = selected[0]!;
    branch = await promptBranchName();
  }

  if (!project || !branch) return;
  if (/\s/.test(branch)) {
    throw new Error('Branch name cannot contain spaces.');
  }

  const label = sanitizeName(branch);
  const repoWorkspaceId = findRepoWorkspaceId(await workspaces.list(), project);

  try {
    const opened = await worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      branch,
      focus: true,
    });
    const openedWorkspace = opened.workspace;
    if (shouldBootstrapWorkspaceLayout(openedWorkspace) && openedWorkspace) {
      const layoutCwd =
        opened.worktreePath ??
        worktreeCheckoutPath(openedWorkspace) ??
        (await resolveLayoutCwd(workspaces, openedWorkspace, project));
      await createProjectLayout(openedWorkspace, layoutCwd, config, tabs, panes, {
        commandContext: context,
        branch,
      });
      await workspaces.focus(openedWorkspace.workspace_id);
      console.log(`✓ bootstrapped layout for existing worktree '${branch}'`);
      return;
    }
    console.log(`✓ opened existing worktree '${branch}'`);
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
    let existingPath = existingWorktreePathFromError(herdrError);
    if (!existingPath && herdrError.stderr.includes('a branch named')) {
      existingPath = await existingWorktreePathFromGit(project, branch);
      if (!existingPath) {
        existingPath = await existingWorktreePathBySlug(project, branch);
      }
    }
    if (!existingPath) throw herdrError;

    const opened = await worktrees.open({
      workspaceId: repoWorkspaceId,
      cwd: repoWorkspaceId ? undefined : project,
      path: existingPath,
      focus: true,
    });
    const openedWorkspace = opened.workspace;
    if (shouldBootstrapWorkspaceLayout(openedWorkspace) && openedWorkspace) {
      const layoutCwd = opened.worktreePath ?? worktreeCheckoutPath(openedWorkspace) ?? project;
      await createProjectLayout(openedWorkspace, layoutCwd, config, tabs, panes, {
        commandContext: context,
        branch,
      });
      await workspaces.focus(openedWorkspace.workspace_id);
      console.log(`✓ bootstrapped layout for '${branch}'`);
      return;
    }
    console.log(`✓ opened existing worktree path '${existingPath}' for '${branch}'`);
    return;
  }

  const layoutCwd = await resolveLayoutCwd(workspaces, workspace, project);
  await createProjectLayout(workspace, layoutCwd, config, tabs, panes, {
    commandContext: context,
    branch,
  });
  await workspaces.focus(workspace.workspace_id);

  console.log(`✓ worktree '${branch}' created and focused (${workspace.workspace_id})`);
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



function findRepoWorkspaceId(workspaces: Workspace[], projectPath: string): string | undefined {
  const normalizedProject = normalizePath(projectPath);
  return workspaces.find((workspace) => !workspace.worktree && normalizePath(workspace.cwd) === normalizedProject)?.workspace_id;
}

function shouldBootstrapWorkspaceLayout(workspace: Workspace | undefined): boolean {
  if (!workspace) return false;
  return workspace.tab_count === 1 && workspace.pane_count === 1;
}

function worktreeCheckoutPath(workspace: Workspace | undefined): string | undefined {
  return workspace?.worktree?.checkout_path ?? workspace?.worktree?.path;
}

async function resolveLayoutCwd(
  workspaces: Workspaces,
  workspace: Workspace,
  fallback: string,
): Promise<string> {
  const current = await workspaces.get(workspace.workspace_id);
  return worktreeCheckoutPath(current) ?? current?.cwd ?? worktreeCheckoutPath(workspace) ?? workspace.cwd ?? fallback;
}

function existingWorktreePathFromError(error: HerdrError): string | undefined {
  const match = error.stderr.match(/already used by worktree at '([^']+)'/);
  return match?.[1];
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

async function existingWorktreePathFromGit(project: string, branch: string): Promise<string | undefined> {
  const proc = Bun.spawn(['git', '-C', project, 'worktree', 'list', '--porcelain'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) return undefined;

  const target = `refs/heads/${branch}`;
  let currentPath: string | undefined;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim();
      continue;
    }
    if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim();
      if (ref === target) return currentPath;
    }
  }
  return undefined;
}



async function existingWorktreePathBySlug(project: string, branch: string): Promise<string | undefined> {
  const proc = Bun.spawn(['git', '-C', project, 'worktree', 'list', '--porcelain'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) return undefined;

  const target = worktreeSlug(branch);
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const path = line.slice('worktree '.length).trim();
    if (worktreeSlug(basename(path)) === target) return path;
  }
  return undefined;
}
