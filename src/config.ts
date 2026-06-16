import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { parse } from 'smol-toml';

type PanePlacement = 'overlay' | 'split' | 'tab' | 'zoomed';
type SplitDirection = 'right' | 'down';

interface RawPaneConfig {
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
}

interface RawConfig {
  agents?: { default?: string };
  projects?: { roots?: string[] };
  layout?: {
    placement?: string;
    focus?: string;
    agent_split?: string;
  };
  tabs?: {
    terminal?: RawTabConfig & {
      agent?: {
        enabled?: boolean;
        title?: string;
      };
    };
    editor?: RawTabConfig;
    server?: RawTabConfig;
  };
}

export interface PaneConfig {
  title: string;
  split?: SplitDirection;
  command: string;
  agent: boolean;
}

export interface TabConfig {
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
  tabs: {
    terminal: TabConfig;
    editor: TabConfig;
    server: TabConfig;
  };
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
    tabs: {
      terminal: buildTerminalTab(pluginConfig),
      editor: buildStandardTab(
        pluginConfig?.tabs?.editor,
        'editor',
        [{ title: 'editor', command: 'nvim', agent: false }],
      ),
      server: buildStandardTab(
        pluginConfig?.tabs?.server,
        'server',
        [{ title: 'server', command: '', agent: false }],
      ),
    },
  };
}

function resolvePluginConfigDir(): string {
  return process.env.HERDR_PLUGIN_CONFIG_DIR ?? join(homedir(), '.config', 'herdr', 'plugins', 'config', 'sessionizer');
}

function loadRaw(path: string): RawConfig | undefined {
  if (!existsSync(path)) return undefined;
  return parse(readFileSync(path, 'utf-8')) as RawConfig;
}

function buildTerminalTab(config: RawConfig | undefined): TabConfig {
  const raw = config?.tabs?.terminal;
  const fallbackAgentSplit = asSplitDirection(config?.layout?.agent_split);
  const explicitPanes = buildPanes(raw?.panes);
  if (explicitPanes.length > 0) {
    return {
      enabled: raw?.enabled ?? true,
      label: raw?.label ?? 'terminal',
      panes: explicitPanes,
    };
  }

  const agentEnabled = raw?.agent?.enabled ?? true;
  const panes: PaneConfig[] = [{ title: 'shell', command: '', agent: false }];
  if (agentEnabled) {
    panes.push({
      title: raw?.agent?.title ?? 'agent',
      split: fallbackAgentSplit,
      command: '',
      agent: true,
    });
  }

  return {
    enabled: raw?.enabled ?? true,
    label: raw?.label ?? 'terminal',
    panes,
  };
}

function buildStandardTab(raw: RawTabConfig | undefined, label: string, fallbackPanes: PaneConfig[]): TabConfig {
  const panes = buildPanes(raw?.panes);
  if (panes.length > 0) {
    return {
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
    enabled,
    label: raw?.label ?? label,
    panes: fallback,
  };
}

function buildPanes(rawPanes: RawPaneConfig[] | undefined): PaneConfig[] {
  if (!rawPanes || rawPanes.length === 0) return [];
  return rawPanes.map((pane, index) => ({
    title: pane.title?.trim() ?? '',
    split: index === 0 ? undefined : asSplitDirection(pane.split),
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
    'title = "shell"',
    'command = ""',
    '',
    '[[tabs.terminal.panes]]',
    'title = "agent"',
    'split = "right"',
    'agent = true',
    '',
    '[tabs.editor]',
    'enabled = true',
    'label = "editor"',
    '',
    '[[tabs.editor.panes]]',
    'title = "editor"',
    'command = "nvim"',
    '',
    '[tabs.server]',
    'enabled = true',
    'label = "server"',
    '',
    '[[tabs.server.panes]]',
    'title = "server"',
    'command = ""',
    '',
  ].join('\n');
}

function asPlacement(value: string | undefined): PanePlacement {
  return value === 'split' || value === 'tab' || value === 'zoomed' ? value : 'overlay';
}

function asSplitDirection(value: string | undefined): SplitDirection {
  return value === 'down' ? 'down' : 'right';
}

function defaultProjectRoots(): string[] {
  return ['~/'];
}

function expandHome(value: string): string {
  return value.startsWith('~/') ? value.replace('~', homedir()) : value;
}
