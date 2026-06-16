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
  const enabledTabs = config.tabs.filter((tab) => tab.enabled);
  if (enabledTabs.length === 0) return workspace;

  let nextPaneIndex = 1;
  let focusedTabId = `${id}:1`;

  const [firstTab, ...remainingTabs] = enabledTabs;
  const initial = await configureExistingTab(
    `${id}:1`,
    `${id}-${nextPaneIndex}`,
    firstTab!,
    cwd,
    tabs,
    panes,
    config.layout.focus,
    options,
  );
  nextPaneIndex = initial.nextPaneIndex;
  if (matchesFocus(config.layout.focus, firstTab!, initial.firstPaneId)) {
    focusedTabId = initial.tabId;
  }

  for (const tab of remainingTabs) {
    const created = await createAndConfigureTab(
      id,
      nextPaneIndex,
      tab,
      cwd,
      tabs,
      panes,
      config.layout.focus,
      options,
    );
    nextPaneIndex = created.nextPaneIndex;
    if (matchesFocus(config.layout.focus, tab, created.firstPaneId)) {
      focusedTabId = created.tabId;
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
  return configureTabPanes(tabId, firstPaneId, 2, tab, cwd, panes, focusTarget, options);
}

async function createAndConfigureTab(
  workspaceId: string,
  nextPaneIndex: number,
  tab: TabConfig,
  cwd: string,
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
  panes: Panes,
  focusTarget: string,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): Promise<TabRuntime> {
  const specs = tab.panes.length > 0 ? tab.panes : [{ id: 'root', title: '', command: '' }];
  validatePaneSpecs(tab, specs);

  const paneIds = new Map<string, string>();
  let currentPaneId = firstPaneId;

  const rootSpec = specs[0]!;
  if (rootSpec.id) {
    paneIds.set(rootSpec.id, currentPaneId);
  }
  await configurePane(currentPaneId, rootSpec, cwd, panes, tab, options).catch(noop);

  for (let index = 1; index < specs.length; index += 1) {
    const spec = specs[index]!;
    const anchorPaneId = spec.from ? paneIds.get(spec.from) : currentPaneId;
    if (!anchorPaneId) {
      throw new Error(`Tab '${tab.label}' references unknown pane '${spec.from ?? ''}'.`);
    }
    const splitPane = await panes
      .split(anchorPaneId, {
        direction: spec.split ?? 'right',
        cwd,
        focus: matchesFocusTarget(focusTarget, spec),
      })
      .catch(noopPane);
    const paneId = splitPane?.pane_id ?? workspacePaneId(firstPaneId, nextPaneIndex);
    nextPaneIndex += 1;
    if (spec.id) {
      paneIds.set(spec.id, paneId);
    }
    await configurePane(paneId, spec, cwd, panes, tab, options).catch(noop);
    currentPaneId = paneId;
  }

  return { tabId, firstPaneId, nextPaneIndex };
}

async function configurePane(
  paneId: string,
  spec: PaneConfig,
  cwd: string,
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

  const command = buildPaneCommand(spec, cwd, tab, options);
  if (command) {
    await panes.run(paneId, command);
  }
}

function buildPaneCommand(
  spec: PaneConfig,
  cwd: string,
  tab: TabConfig,
  options?: {
    agentContext?: string;
    branch?: string;
    defaultServerCommand?: string;
  },
): string {
  const quotedCwd = shellQuote(cwd);
  const rawCommand = spec.command || fallbackPaneCommand(tab, spec, options);
  if (rawCommand) {
    return `cd ${quotedCwd} && ${interpolateCommand(applyAgentContext(rawCommand, options?.agentContext), options?.branch)}`;
  }

  return `cd ${quotedCwd}`;
}

function matchesFocus(focusTarget: string, tab: TabConfig, firstPaneId: string): boolean {
  if (focusTarget === tab.label) return true;
  return tab.panes.some((pane) => matchesFocusTarget(focusTarget, pane));
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

function applyAgentContext(command: string, context?: string): string {
  if (!context) return command;
  const trimmed = command.trim();
  if (trimmed === 'kiro-cli') {
    return `kiro-cli chat ${shellQuote(context)}`;
  }
  if (trimmed.startsWith('kiro-cli chat ')) {
    return `${trimmed} ${shellQuote(context)}`;
  }
  if (trimmed === 'kiro-cli chat') {
    return `kiro-cli chat ${shellQuote(context)}`;
  }
  return command;
}

function validatePaneSpecs(tab: TabConfig, specs: readonly PaneConfig[]): void {
  const seenIds = new Set<string>();
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]!;
    if (index === 0) {
      if (spec.from) {
        throw new Error(`Tab '${tab.label}' cannot set 'from' on its first pane.`);
      }
    } else if (spec.from && !seenIds.has(spec.from)) {
      throw new Error(
        `Tab '${tab.label}' references pane '${spec.from}' before it is defined. List target panes earlier in the same tab.`,
      );
    }
    if (spec.id) {
      if (seenIds.has(spec.id)) {
        throw new Error(`Tab '${tab.label}' has duplicate pane id '${spec.id}'.`);
      }
      seenIds.add(spec.id);
    }
  }
}

function matchesFocusTarget(focusTarget: string, pane: PaneConfig): boolean {
  return pane.title === focusTarget || pane.id === focusTarget;
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
