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
}

interface RawTabConfig {
  enabled?: boolean;
  label?: string;
  command?: string;
  panes?: RawPaneConfig[];
}

interface RawConfig {
  projects?: { roots?: string[] };
  layout?: {
    placement?: string;
    focus?: string;
  };
  tabs?: Record<string, RawTabConfig>;
}

export interface PaneConfig {
  id?: string;
  from?: string;
  title: string;
  split?: SplitDirection;
  command: string;
}

export interface TabConfig {
  id: string;
  enabled: boolean;
  label: string;
  panes: PaneConfig[];
}

export interface SessionizerConfig {
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
  const roots = pluginConfig?.projects?.roots?.map(expandHome).filter((value) => value.trim().length > 0) ?? [];
  if (roots.length === 0) {
    throw new Error('Config must define at least one [projects].roots entry.');
  }

  const focus = pluginConfig?.layout?.focus?.trim();
  if (!focus) {
    throw new Error('Config must define [layout].focus.');
  }

  return {
    projects: {
      roots,
    },
    layout: {
      placement: asPlacement(pluginConfig?.layout?.placement),
      focus,
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
  const rawTabs = config?.tabs;
  if (!rawTabs || Object.keys(rawTabs).length === 0) {
    throw new Error('Config must define at least one [tabs.<name>] section.');
  }

  return Object.entries(rawTabs).map(([id, raw]) => {
    const panes = buildPanes(raw?.panes, id);
    return {
      id,
      enabled: raw?.enabled ?? true,
      label: raw?.label ?? id,
      panes,
    };
  });
}

function buildPanes(rawPanes: RawPaneConfig[] | undefined, tabId: string): PaneConfig[] {
  if (!rawPanes || rawPanes.length === 0) {
    throw new Error(`Tab '${tabId}' must define at least one [[tabs.${tabId}.panes]] entry.`);
  }
  return rawPanes.map((pane, index) => ({
    id: pane.id?.trim() || undefined,
    from: pane.from?.trim() || undefined,
    title: pane.title?.trim() ?? '',
    split: index === 0 && !pane.from ? undefined : asOptionalSplitDirection(pane.split),
    command: pane.command ?? '',
  }));
}

function defaultConfigToml(): string {
  return [
    '[projects]',
    `roots = ["~/Projects", "~/Workspace"]`,
    '',
    '[layout]',
    'placement = "overlay"',
    'focus = "assistant"',
    '',
    '[tabs.terminal]',
    'enabled = true',
    'label = "terminal"',
    '',
    '[[tabs.terminal.panes]]',
    'id = "shell"',
    'title = "shell"',
    'command = ""',
    '',
    '[[tabs.terminal.panes]]',
    'id = "assistant"',
    'from = "shell"',
    'title = "assistant"',
    'split = "right"',
    'command = "opencode"',
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
  if (value === 'overlay' || value === 'split') return value;
  throw new Error("Config must define [layout].placement as 'overlay' or 'split'.");
}

function asSplitDirection(value: string | undefined): SplitDirection {
  return value === 'down' ? 'down' : 'right';
}

function asOptionalSplitDirection(value: string | undefined): SplitDirection | undefined {
  if (!value) return undefined;
  return asSplitDirection(value);
}

function expandHome(value: string): string {
  return value.startsWith('~/') ? value.replace('~', homedir()) : value;
}
