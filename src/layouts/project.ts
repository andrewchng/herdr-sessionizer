import type { Workspace } from '../client/types.ts';
import type { Panes } from '../ops/panes.ts';
import type { Tabs } from '../ops/tabs.ts';

export async function createProjectLayout(
  workspace: Workspace,
  cwd: string,
  agent: string,
  tabs: Tabs,
  panes: Panes,
): Promise<Workspace> {
  const id = workspace.workspace_id;
  const quotedCwd = shellQuote(cwd);

  await tabs.rename(`${id}:1`, 'terminal').catch(noop);
  await panes.run(`${id}-1`, `cd ${quotedCwd}`).catch(noop);
  await panes.split(`${id}-1`, { direction: 'right', cwd, focus: false }).catch(noop);
  await panes.run(`${id}-2`, `cd ${quotedCwd} && ${agent}`).catch(noop);
  await tabs.create({ workspace_id: id, cwd, label: 'editor', focus: false }).catch(noop);
  await panes.run(`${id}-3`, 'nvim').catch(noop);
  await tabs.create({ workspace_id: id, cwd, label: 'server', focus: false }).catch(noop);
  await tabs.focus(`${id}:1`).catch(noop);

  return workspace;
}

function noop(): void {}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
