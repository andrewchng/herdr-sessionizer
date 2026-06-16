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
  'path={};',
  'if [ -f "$path/README.md" ]; then',
  '  bat --color=always "$path/README.md" 2>/dev/null || head -50 "$path/README.md";',
  'else',
  '  ls -la "$path";',
  'fi',
].join(' ');



function workspaceRow(workspace: Workspace): string {
  return `${workspace.workspace_id} ${workspace.label ?? ''}`;
}

function extractWorkspaceId(row: string): string {
  return row.split(' ')[0] ?? row;
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

if (import.meta.main) {
  runSessionizer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
