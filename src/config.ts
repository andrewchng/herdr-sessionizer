import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { parse } from 'smol-toml';

type PanePlacement = 'overlay' | 'split';
type SplitDirection = 'right' | 'down';

interface RawPaneConfig {
  id?: string;
  from?: string;
  title?: string;
  split?: string;
  command?: string;
  agent?: boolean;
}

interface RawTabConfig {
  enabled?: boolean;
  label?: string;
  command?: string;
  panes?: RawPaneConfig[];
  agent?: {
    enabled?: boolean;
    title?: string;
  };
}

interface RawConfig {
  agents?: { default?: string };
  projects?: { roots?: string[] };
  layout?: {
    placement?: string;
    focus?: string;
    agent_split?: string;
  };
  tabs?: Record<string, RawTabConfig>;
}

export interface PaneConfig {
  id?: string;
  from?: string;
  title: string;
  split?: SplitDirection;
  command: string;
  agent: boolean;
}

export interface TabConfig {
  id: string;
  enabled: boolean;
  label: string;
  panes: PaneConfig[];
}

export interface SessionizerConfig {
  agent: string;
  projects: {
    roots: string[];
  };
  layout: {
    placement: PanePlacement;
    focus: string;
  };
  tabs: TabConfig[];
}

export function loadConfig(): SessionizerConfig {
  const pluginConfigDir = resolvePluginConfigDir();
  const pluginConfigPath = join(pluginConfigDir, 'config.toml');

  if (!existsSync(pluginConfigPath)) {
    mkdirSync(pluginConfigDir, { recursive: true });
    writeFileSync(pluginConfigPath, defaultConfigToml(), 'utf-8');
  }

  const pluginConfig = loadRaw(pluginConfigPath);

  return {
    agent: process.env.AI_AGENT ?? pluginConfig?.agents?.default ?? 'opencode',
    projects: {
      roots: (pluginConfig?.projects?.roots ?? defaultProjectRoots()).map(expandHome),
    },
    layout: {
      placement: asPlacement(pluginConfig?.layout?.placement),
      focus: pluginConfig?.layout?.focus?.trim() || 'agent',
    },
    tabs: buildTabs(pluginConfig),
  };
}

function resolvePluginConfigDir(): string {
  return process.env.HERDR_PLUGIN_CONFIG_DIR ?? join(homedir(), '.config', 'herdr', 'plugins', 'config', 'sessionizer');
}

function loadRaw(path: string): RawConfig | undefined {
  if (!existsSync(path)) return undefined;
  return parse(readFileSync(path, 'utf-8')) as RawConfig;
}

function buildTabs(config: RawConfig | undefined): TabConfig[] {
  const rawTabs = config?.tabs ?? {};
  const orderedIds = ['terminal', 'editor', 'server', ...Object.keys(rawTabs).filter((key) => !isBuiltInTab(key))];

  return orderedIds.map((id) => {
    const raw = rawTabs[id];
    if (id === 'terminal') {
      return buildTerminalTab(id, raw, config);
    }
    if (id === 'editor') {
      return buildStandardTab(id, raw, 'editor', [{ id: 'editor', title: 'editor', command: 'nvim', agent: false }]);
    }
    if (id === 'server') {
      return buildStandardTab(id, raw, 'server', [{ id: 'server', title: 'server', command: '', agent: false }]);
    }
    return buildStandardTab(id, raw, id, [{ id, title: id, command: '', agent: false }]);
  });
}

function buildTerminalTab(id: string, raw: RawTabConfig | undefined, config: RawConfig | undefined): TabConfig {
  const fallbackAgentSplit = asSplitDirection(config?.layout?.agent_split);
  const explicitPanes = buildPanes(raw?.panes);
  if (explicitPanes.length > 0) {
    return {
      id,
      enabled: raw?.enabled ?? true,
      label: raw?.label ?? 'terminal',
      panes: explicitPanes,
    };
  }

  const agentEnabled = raw?.agent?.enabled ?? true;
  const panes: PaneConfig[] = [{ id: 'shell', title: 'shell', command: '', agent: false }];
  if (agentEnabled) {
    panes.push({
      id: 'agent',
      from: 'shell',
      title: raw?.agent?.title ?? 'agent',
      split: fallbackAgentSplit,
      command: '',
      agent: true,
    });
  }

  return {
    id,
    enabled: raw?.enabled ?? true,
    label: raw?.label ?? 'terminal',
    panes,
  };
}

function buildStandardTab(id: string, raw: RawTabConfig | undefined, label: string, fallbackPanes: PaneConfig[]): TabConfig {
  const panes = buildPanes(raw?.panes);
  if (panes.length > 0) {
    return {
      id,
      enabled: raw?.enabled ?? true,
      label: raw?.label ?? label,
      panes,
    };
  }

  const enabled = raw?.enabled ?? true;
  const fallback = fallbackPanes.map((pane) => ({
    ...pane,
    command: raw?.command ?? pane.command,
  }));

  return {
    id,
    enabled,
    label: raw?.label ?? label,
    panes: fallback,
  };
}

function buildPanes(rawPanes: RawPaneConfig[] | undefined): PaneConfig[] {
  if (!rawPanes || rawPanes.length === 0) return [];
  return rawPanes.map((pane, index) => ({
    id: pane.id?.trim() || undefined,
    from: pane.from?.trim() || undefined,
    title: pane.title?.trim() ?? '',
    split: index === 0 && !pane.from ? undefined : asOptionalSplitDirection(pane.split),
    command: pane.command ?? '',
    agent: pane.agent ?? false,
  }));
}

function defaultConfigToml(): string {
  return [
    '[agents]',
    'default = "opencode"',
    '',
    '[projects]',
    `roots = ["~/"]`,
    '',
    '[layout]',
    'placement = "overlay"',
    'focus = "agent"',
    '',
    '[tabs.terminal]',
    'label = "terminal"',
    '',
    '[[tabs.terminal.panes]]',
    'id = "shell"',
    'title = "shell"',
    'command = ""',
    '',
    '[[tabs.terminal.panes]]',
    'id = "agent"',
    'from = "shell"',
    'title = "agent"',
    'split = "right"',
    'agent = true',
    '',
    '[tabs.editor]',
    'enabled = true',
    'label = "editor"',
    '',
    '[[tabs.editor.panes]]',
    'id = "editor"',
    'title = "editor"',
    'command = "nvim"',
    '',
    '[tabs.server]',
    'enabled = true',
    'label = "server"',
    '',
    '[[tabs.server.panes]]',
    'id = "server"',
    'title = "server"',
    'command = ""',
    '',
  ].join('\n');
}

function asPlacement(value: string | undefined): PanePlacement {
  return value === 'split' ? value : 'overlay';
}

function asSplitDirection(value: string | undefined): SplitDirection {
  return value === 'down' ? 'down' : 'right';
}

function asOptionalSplitDirection(value: string | undefined): SplitDirection | undefined {
  if (!value) return undefined;
  return asSplitDirection(value);
}

function defaultProjectRoots(): string[] {
  return ['~/'];
}

function isBuiltInTab(value: string): boolean {
  return value === 'terminal' || value === 'editor' || value === 'server';
}

function expandHome(value: string): string {
  return value.startsWith('~/') ? value.replace('~', homedir()) : value;
}
