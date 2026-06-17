import { basename } from 'node:path';

import { listProjects, sanitizeName } from './discovery.ts';

import type { Workspace } from './client/types.ts';
import { Herdr } from './client/herdr.ts';
import { loadConfig } from './config.ts';
import { createProjectLayout } from './layouts/project.ts';
import { Panes } from './ops/panes.ts';
import { Tabs } from './ops/tabs.ts';
import { Workspaces } from './ops/workspaces.ts';
import { pick } from './ui/fzf.ts';

const PROJECT_PREVIEW = [
  "sh -c '",
  'path="$1";',
  'if [ -f "$path/README.md" ]; then',
  '  if command -v bat >/dev/null 2>&1; then',
  '    bat --color=always -- "$path/README.md";',
  '  else',
  '    head -50 "$path/README.md";',
  '  fi;',
  'elif [ -d "$path" ]; then',
  '  command ls -la -- "$path" 2>/dev/null | head -50;',
  'else',
  '  printf "%s\\n" "$path";',
  'fi',
  "' sh {}",
].join(' ');

const WORKSPACE_PREVIEW = [
  "sh -c '",
  'label="$1";',
  'summary="$2";',
  'cwd="$3";',
  'branch="$4";',
  'tabs="$5";',
  'panes="$6";',
  'printf \"label: %s\\n\" \"$label\";',
  'printf \"summary: %s\\n\" \"$summary\";',
  'if [ -n \"$branch\" ]; then printf \"branch: %s\\n\" \"$branch\"; fi;',
  'if [ -n \"$cwd\" ]; then printf \"cwd: %s\\n\" \"$cwd\"; fi;',
  'printf \"tabs: %s\\npanes: %s\\n\\n\" \"$tabs\" \"$panes\";',
  'if [ -n \"$cwd\" ] && [ -f \"$cwd/README.md\" ]; then',
  '  if command -v bat >/dev/null 2>&1; then',
  '    bat --color=always -- \"$cwd/README.md\";',
  '  else',
  '    head -50 \"$cwd/README.md\";',
  '  fi;',
  'elif [ -n \"$cwd\" ] && [ -d \"$cwd\" ]; then',
  '  command ls -la -- \"$cwd\" 2>/dev/null | head -50;',
  'fi',
  "' sh {2} {3} {4} {5} {6} {7}",
].join(' ');

const WORKSPACE_ROW_DELIMITER = '\t';

function workspaceRow(workspace: Workspace): string {
  const label = rowField(workspace.label || workspaceName(workspace));
  const summary = rowField(workspaceSummary(workspace));
  const cwd = rowField(workspacePath(workspace));
  const branch = rowField(workspace.worktree?.branch);
  const tabCount = String(workspace.tab_count ?? 0);
  const paneCount = String(workspace.pane_count ?? 0);

  return [
    workspace.workspace_id,
    label,
    summary,
    cwd,
    branch,
    tabCount,
    paneCount,
  ].join(WORKSPACE_ROW_DELIMITER);
}

function extractWorkspaceId(row: string): string {
  return row.split(WORKSPACE_ROW_DELIMITER)[0] ?? row;
}

export async function runSessionizer(): Promise<void> {
  const herdr = new Herdr();
  const workspaces = new Workspaces(herdr);
  const tabs = new Tabs(herdr);
  const panes = new Panes(herdr);
  const config = loadConfig();

  const existing = await pick((await workspaces.list()).map(workspaceRow), {
    prompt: 'Switch session (Esc for new): ',
    header: '↑↓ navigate, Enter select, Esc → new project',
    delimiter: WORKSPACE_ROW_DELIMITER,
    withNth: '2',
    preview: WORKSPACE_PREVIEW,
    previewWindow: 'right:50%',
  });

  if (existing && existing.length > 0) {
    await workspaces.focus(extractWorkspaceId(existing[0]!));
    return;
  }

  const projects = listProjects(config.projects.roots);
  if (projects.length === 0) {
    console.error('No projects found in configured directories.');
    process.exit(1);
  }

  const selected = await pick(projects, {
    prompt: 'Project: ',
    header: 'Select a project to create a workspace',
    preview: PROJECT_PREVIEW,
    previewWindow: 'right:50%',
  });

  if (!selected || selected.length === 0) return;

  const project = selected[0]!;
  const projectName = project.split('/').pop() ?? project;
  const label = sanitizeName(projectName);
  const workspace = await workspaces.create({ cwd: project, label, focus: false });

  await createProjectLayout(workspace, project, config, tabs, panes);
  await workspaces.focus(workspace.workspace_id);

  console.log(`✓ workspace '${label}' created and focused (${workspace.workspace_id})`);
}

function workspaceName(workspace: Workspace): string {
  const path = workspacePath(workspace);
  if (path) {
    return basename(path);
  }

  return workspace.workspace_id;
}

function workspaceSummary(workspace: Workspace): string {
  const path = workspacePath(workspace);
  const location = path ? basename(path) : workspace.worktree?.repo_name;
  const branch = workspace.worktree?.branch;
  if (branch) {
    return location ? `${branch} · ${location}` : branch;
  }

  if (location) {
    return location;
  }

  const tabs = workspace.tab_count ?? 0;
  const panes = workspace.pane_count ?? 0;
  return `${tabs} tabs · ${panes} panes`;
}

function workspacePath(workspace: Workspace): string | undefined {
  return workspace.cwd ?? workspace.worktree?.checkout_path ?? workspace.worktree?.repo_root ?? workspace.worktree?.path;
}

function rowField(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replaceAll('\t', ' ').replaceAll('\n', ' ').trim();
}

if (import.meta.main) {
  runSessionizer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
