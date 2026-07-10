import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { expandHome } from "../discovery/discovery.ts";

import { parse } from "smol-toml";

type PanePlacement = "overlay" | "split";
type SplitDirection = "right" | "down";

interface RawPaneConfig {
  id?: string;
  from?: string;
  title?: string;
  split?: string;
  ratio?: unknown;
  command?: string;
  accept_command_override?: boolean;
}

interface RawTabConfig {
  label?: string;
  command?: string;
  panes?: RawPaneConfig[];
}

interface RawConfig {
  projects?: {
    roots?: string[];
    git_only?: boolean;
    depth?: unknown;
  };
  find?: {
    roots?: string[];
    depth?: unknown;
  };
  current?: {
    enabled?: boolean;
    siblings?: boolean;
    children?: boolean;
  };
  recent?: {
    enabled?: boolean;
    limit?: unknown;
  };
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
  ratio?: number;
  command: string;
  accept_command_override?: boolean;
}

export interface TabConfig {
  id: string;
  label: string;
  panes: PaneConfig[];
}

export interface FindConfig {
  roots: string[];
  depth: number;
}

export interface CurrentConfig {
  enabled: boolean;
  siblings: boolean;
  children: boolean;
}

export interface RecentConfig {
  enabled: boolean;
  limit: number;
}

export interface SessionizerConfig {
  projects: {
    roots: string[];
    git_only: boolean;
    depth: number;
  };
  find: FindConfig;
  current: CurrentConfig;
  recent: RecentConfig;
  layout: {
    placement: PanePlacement;
    focus: string;
  };
  tabs: TabConfig[];
}

export const REPO_LAYOUT_CONFIG_RELATIVE = join(".sessionizer", "config.toml");

export function resolveRepoLayoutPath(layoutCwd: string): string {
  return join(layoutCwd, REPO_LAYOUT_CONFIG_RELATIVE);
}

export function resolveLayoutConfig(
  layoutCwd: string,
  global?: SessionizerConfig
): SessionizerConfig {
  const globalConfig = global ?? loadConfig();
  const repoPath = resolveRepoLayoutPath(layoutCwd);

  if (!existsSync(repoPath)) {
    return globalConfig;
  }

  try {
    const raw = loadRaw(repoPath);
    const focus = raw?.layout?.focus?.trim();
    if (!focus) {
      throw new Error("Repo layout config must define [layout].focus.");
    }

    return {
      projects: globalConfig.projects,
      find: globalConfig.find,
      current: globalConfig.current,
      recent: globalConfig.recent,
      layout: {
        placement: globalConfig.layout.placement,
        focus,
      },
      tabs: buildTabs(raw),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message} (${repoPath})`);
  }
}

export function loadConfig(): SessionizerConfig {
  const pluginConfigDir = resolvePluginConfigDir();
  const pluginConfigPath = join(pluginConfigDir, "config.toml");

  if (!existsSync(pluginConfigPath)) {
    mkdirSync(pluginConfigDir, { recursive: true });
    writeFileSync(pluginConfigPath, defaultConfigToml(), "utf-8");
  }

  const pluginConfig = loadRaw(pluginConfigPath);
  const roots =
    pluginConfig?.projects?.roots
      ?.map(expandHome)
      .filter((value) => value.trim().length > 0) ?? [];
  if (roots.length === 0) {
    throw new Error("Config must define at least one [projects].roots entry.");
  }
  const gitOnly = pluginConfig?.projects?.git_only ?? false;
  const depth = asProjectDepth(pluginConfig?.projects?.depth);

  const focus = pluginConfig?.layout?.focus?.trim();
  if (!focus) {
    throw new Error("Config must define [layout].focus.");
  }

  return {
    projects: {
      roots,
      git_only: gitOnly,
      depth,
    },
    find: buildFindConfig(pluginConfig),
    current: buildCurrentConfig(pluginConfig),
    recent: buildRecentConfig(pluginConfig),
    layout: {
      placement: asPlacement(pluginConfig?.layout?.placement),
      focus,
    },
    tabs: buildTabs(pluginConfig),
  };
}

/**
 * Deep-search config for the "find" picker source. Defaults to searching the
 * home directory two levels deep, mirroring sesh's `fd -H -d 2 -t d . ~`.
 */
function buildFindConfig(config: RawConfig | undefined): FindConfig {
  const rawRoots = config?.find?.roots;
  const roots =
    rawRoots && rawRoots.length > 0
      ? rawRoots.map(expandHome).filter((value) => value.trim().length > 0)
      : [homedir()];
  return {
    roots: roots.length > 0 ? roots : [homedir()],
    depth: asFindDepth(config?.find?.depth),
  };
}

/**
 * Current-folder source config: which neighbours of the launch directory to
 * surface. Enabled by default with both siblings and immediate children.
 */
function buildCurrentConfig(config: RawConfig | undefined): CurrentConfig {
  return {
    enabled: config?.current?.enabled ?? true,
    siblings: config?.current?.siblings ?? true,
    children: config?.current?.children ?? true,
  };
}

/**
 * Frecency ("recent") source config. Enabled by default, capped so the merged
 * list stays focused on the most frecent directories.
 */
function buildRecentConfig(config: RawConfig | undefined): RecentConfig {
  return {
    enabled: config?.recent?.enabled ?? true,
    limit: asRecentLimit(config?.recent?.limit),
  };
}

function resolvePluginConfigDir(): string {
  return (
    process.env.HERDR_PLUGIN_CONFIG_DIR ??
    join(homedir(), ".config", "herdr", "plugins", "config", "sessionizer")
  );
}

function loadRaw(path: string): RawConfig | undefined {
  if (!existsSync(path)) return undefined;
  return parse(readFileSync(path, "utf-8")) as RawConfig;
}

function buildTabs(config: RawConfig | undefined): TabConfig[] {
  const rawTabs = config?.tabs;
  if (!rawTabs || Object.keys(rawTabs).length === 0) {
    throw new Error("Config must define at least one [tabs.<name>] section.");
  }

  return Object.entries(rawTabs).map(([id, raw]) => {
    const panes = buildPanes(raw?.panes, id);
    return {
      id,
      label: raw?.label ?? id,
      panes,
    };
  });
}

function buildPanes(
  rawPanes: RawPaneConfig[] | undefined,
  tabId: string
): PaneConfig[] {
  if (!rawPanes || rawPanes.length === 0) {
    throw new Error(
      `Tab '${tabId}' must define at least one [[tabs.${tabId}.panes]] entry.`
    );
  }
  return rawPanes.map((pane, index) => {
    const ratio = asOptionalPaneRatio(pane.ratio, tabId, index);
    if (index === 0 && ratio !== undefined) {
      throw new Error(`Tab '${tabId}' cannot set 'ratio' on its first pane.`);
    }

    return {
      id: pane.id?.trim() || undefined,
      from: pane.from?.trim() || undefined,
      title: pane.title?.trim() ?? "",
      split:
        index === 0 && !pane.from
          ? undefined
          : asOptionalSplitDirection(pane.split),
      ratio,
      command: pane.command ?? "",
      accept_command_override: pane.accept_command_override ?? false,
    };
  });
}

function defaultConfigToml(): string {
  return [
    "[projects]",
    "# Parent folders searched by the interactive pickers",
    `roots = ["~/Projects", "~/Workspace"]`,
    "# true: only git repos; false: all immediate child folders",
    "git_only = true",
    "# Only used when git_only = true; 1 means immediate children",
    "depth = 1",
    "",
    "# Deep-search source: the in-picker 'find' toggle (ctrl-f) searches these",
    "# roots up to `depth` levels (like sesh's `fd -H -d 2 -t d . ~`).",
    "[find]",
    'roots = ["~"]',
    "depth = 2",
    "",
    "# Current-folder source: sibling and child directories of wherever the",
    "# picker was launched from, so you can hop between nearby projects.",
    "[current]",
    "enabled = true",
    "siblings = true",
    "children = true",
    "",
    "# Recency source: frecency-ranked directories (reads zoxide when present,",
    "# otherwise a built-in store). `limit` caps how many are merged in.",
    "[recent]",
    "enabled = true",
    "limit = 50",
    "",
    "[layout]",
    "# How the plugin pane itself opens: overlay | split",
    'placement = "overlay"',
    "# Which pane or tab to focus after layout creation",
    'focus = "editor"',
    "",
    "[tabs.dev]",
    'label = "dev"',
    "",
    "[[tabs.dev.panes]]",
    'id = "editor"',
    'title = "nvim"',
    'command = "nvim"',
    "",
    "[[tabs.dev.panes]]",
    'id = "agent"',
    '# Split this pane from the earlier pane with id = "editor"',
    'from = "editor"',
    'title = "agent"',
    "# Split direction for the new pane: right or down",
    'split = "right"',
    "# Optional: ratio controls the new pane's share of the split axis (0 < ratio < 1)",
    "ratio = 0.3",
    'command = "opencode"',
    "",
    "[[tabs.dev.panes]]",
    'id = "git"',
    '# Split this pane from the earlier pane with id = "editor"',
    'from = "editor"',
    'title = "lazygit"',
    "# Split direction for the new pane: right or down",
    'split = "down"',
    'command = "lazygit"',
    "",
  ].join("\n");
}

function asPlacement(value: string | undefined): PanePlacement {
  if (value === "overlay" || value === "split") return value;
  throw new Error(
    "Config must define [layout].placement as 'overlay' or 'split'."
  );
}

function asProjectDepth(value: unknown): number {
  if (value === undefined) {
    return 1;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw new Error("Config [projects].depth must be an integer >= 1.");
  }

  return value;
}

function asFindDepth(value: unknown): number {
  if (value === undefined) {
    return 2;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw new Error("Config [find].depth must be an integer >= 1.");
  }

  return value;
}

function asRecentLimit(value: unknown): number {
  if (value === undefined) {
    return 50;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 1
  ) {
    throw new Error("Config [recent].limit must be an integer >= 1.");
  }

  return value;
}

function asSplitDirection(value: string | undefined): SplitDirection {
  return value === "down" ? "down" : "right";
}

function asOptionalSplitDirection(
  value: string | undefined
): SplitDirection | undefined {
  if (!value) return undefined;
  return asSplitDirection(value);
}

function asOptionalPaneRatio(
  value: unknown,
  tabId: string,
  paneIndex: number
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Tab '${tabId}' pane ${paneIndex + 1} ratio must be a finite number between 0 and 1.`
    );
  }

  if (value <= 0 || value >= 1) {
    throw new Error(
      `Tab '${tabId}' pane ${paneIndex + 1} ratio must be greater than 0 and less than 1.`
    );
  }

  return value;
}
