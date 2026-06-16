import type { SessionizerConfig, PaneConfig, TabConfig } from '../config.ts';
import type { Workspace } from '../client/types.ts';
import type { Panes } from '../ops/panes.ts';
import type { Tabs } from '../ops/tabs.ts';

interface TabRuntime {
  tabId: string;
  firstPaneId: string;
  nextPaneIndex: number;
}

export async function createProjectLayout(
  workspace: Workspace,
  cwd: string,
  config: SessionizerConfig,
  tabs: Tabs,
  panes: Panes,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): Promise<Workspace> {
  const id = workspace.workspace_id;
  let nextPaneIndex = 1;
  let focusedTabId = `${id}:1`;

  const terminal = await configureExistingTab(
    `${id}:1`,
    `${id}-${nextPaneIndex}`,
    config.tabs.terminal,
    cwd,
    config,
    tabs,
    panes,
    config.layout.focus,
    options,
  );
  nextPaneIndex = terminal.nextPaneIndex;
  if (matchesFocus(config.layout.focus, config.tabs.terminal, terminal.firstPaneId)) {
    focusedTabId = terminal.tabId;
  }

  if (config.tabs.editor.enabled) {
    const editor = await createAndConfigureTab(
      id,
      nextPaneIndex,
      config.tabs.editor,
      cwd,
      config,
      tabs,
      panes,
      config.layout.focus,
      options,
    );
    nextPaneIndex = editor.nextPaneIndex;
    if (matchesFocus(config.layout.focus, config.tabs.editor, editor.firstPaneId)) {
      focusedTabId = editor.tabId;
    }
  }

  if (config.tabs.server.enabled) {
    const server = await createAndConfigureTab(
      id,
      nextPaneIndex,
      config.tabs.server,
      cwd,
      config,
      tabs,
      panes,
      config.layout.focus,
      options,
    );
    if (matchesFocus(config.layout.focus, config.tabs.server, server.firstPaneId)) {
      focusedTabId = server.tabId;
    }
  }

  await tabs.focus(focusedTabId).catch(noop);
  return workspace;
}

async function configureExistingTab(
  tabId: string,
  firstPaneId: string,
  tab: TabConfig,
  cwd: string,
  config: SessionizerConfig,
  tabs: Tabs,
  panes: Panes,
  focusTarget: string,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): Promise<TabRuntime> {
  await tabs.rename(tabId, tab.label).catch(noop);
  return configureTabPanes(tabId, firstPaneId, 2, tab, cwd, config, panes, focusTarget, options);
}

async function createAndConfigureTab(
  workspaceId: string,
  nextPaneIndex: number,
  tab: TabConfig,
  cwd: string,
  config: SessionizerConfig,
  tabs: Tabs,
  panes: Panes,
  focusTarget: string,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): Promise<TabRuntime> {
  const tabResult = await tabs
    .create({
      workspace_id: workspaceId,
      cwd,
      label: tab.label,
      focus: matchesFocus(focusTarget, tab, `${workspaceId}-${nextPaneIndex}`),
    })
    .catch(noopTab);

  const tabId = tabResult?.tab_id ?? `${workspaceId}:unknown`;
  return configureTabPanes(
    tabId,
    `${workspaceId}-${nextPaneIndex}`,
    nextPaneIndex + 1,
    tab,
    cwd,
    config,
    panes,
    focusTarget,
    options,
  );
}

async function configureTabPanes(
  tabId: string,
  firstPaneId: string,
  nextPaneIndex: number,
  tab: TabConfig,
  cwd: string,
  config: SessionizerConfig,
  panes: Panes,
  focusTarget: string,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): Promise<TabRuntime> {
  const specs = tab.panes.length > 0 ? tab.panes : [{ title: '', command: '', agent: false }];
  let currentPaneId = firstPaneId;

  await configurePane(currentPaneId, specs[0]!, cwd, config, panes, tab, options).catch(noop);

  for (let index = 1; index < specs.length; index += 1) {
    const spec = specs[index]!;
    const splitPane = await panes
      .split(currentPaneId, {
        direction: spec.split ?? 'right',
        cwd,
        focus: spec.title === focusTarget,
      })
      .catch(noopPane);
    const paneId = splitPane?.pane_id ?? workspacePaneId(firstPaneId, nextPaneIndex);
    nextPaneIndex += 1;
    await configurePane(paneId, spec, cwd, config, panes, tab, options).catch(noop);
    currentPaneId = paneId;
  }

  return { tabId, firstPaneId, nextPaneIndex };
}

async function configurePane(
  paneId: string,
  spec: PaneConfig,
  cwd: string,
  config: SessionizerConfig,
  panes: Panes,
  tab: TabConfig,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): Promise<void> {
  if (spec.title) {
    await panes.rename(paneId, spec.title);
  }

  const command = buildPaneCommand(spec, cwd, config.agent, tab, options);
  if (command) {
    await panes.run(paneId, command);
  }
}

function buildPaneCommand(
  spec: PaneConfig,
  cwd: string,
  agent: string,
  tab: TabConfig,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): string {
  const quotedCwd = shellQuote(cwd);
  if (spec.agent) {
    return `cd ${quotedCwd} && ${buildAgentCommand(agent, options?.agentContext)}`;
  }

  const rawCommand = spec.command || fallbackPaneCommand(tab, spec, options);
  if (rawCommand) {
    return `cd ${quotedCwd} && ${interpolateCommand(rawCommand, options?.branch)}`;
  }

  return `cd ${quotedCwd}`;
}

function matchesFocus(focusTarget: string, tab: TabConfig, firstPaneId: string): boolean {
  if (focusTarget === tab.label) return true;
  return tab.panes.some((pane, index) =>
    pane.title === focusTarget || (index === 0 && focusTarget === 'shell' && firstPaneId.endsWith('-1')),
  );
}

function workspacePaneId(firstPaneId: string, index: number): string {
  return firstPaneId.replace(/-\d+$/, `-${index}`);
}

function noop(): void {}

function noopPane(): undefined {
  return undefined;
}

function noopTab(): undefined {
  return undefined;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildAgentCommand(agent: string, context?: string): string {
  if (!context) return agent;
  const trimmed = agent.trim();
  if (trimmed === 'kiro-cli') {
    return `kiro-cli chat ${shellQuote(context)}`;
  }
  if (trimmed.startsWith('kiro-cli chat ')) {
    return `${trimmed} ${shellQuote(context)}`;
  }
  if (trimmed === 'kiro-cli chat') {
    return `kiro-cli chat ${shellQuote(context)}`;
  }
  return agent;
}

function fallbackPaneCommand(
  tab: TabConfig,
  spec: PaneConfig,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): string {
  if (options?.defaultServerCommand && tab.label === 'server' && spec.title === 'server') {
    return options.defaultServerCommand;
  }
  return '';
}

function interpolateCommand(command: string, branch?: string): string {
  return branch ? command.replaceAll('{branch}', branch) : command;
}
