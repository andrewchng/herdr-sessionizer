import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { expandHome } from "../discovery/discovery.ts";

import { parse } from "smol-toml";

type PanePlacement = "overlay" | "split" | "popup";
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
  ui?: {
    placement?: string;
    width?: unknown;
    height?: unknown;
  };
  layout?: {
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

interface UiConfig {
  /** How Sessionizer / Worktree pickers open inside Herdr. */
  placement: PanePlacement;
  /** Outer popup width (cells or `"90%"`). Only used when placement is `popup`. */
  width?: number | string;
  /** Outer popup height (cells or `"90%"`). Only used when placement is `popup`. */
  height?: number | string;
}

export interface SessionizerConfig {
  projects: {
    roots: string[];
    git_only: boolean;
    depth: number;
  };
  ui: UiConfig;
  layout: {
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
      ui: globalConfig.ui,
      layout: {
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

  const tabs = buildTabs(pluginConfig, { required: false });
  const focus = pluginConfig?.layout?.focus?.trim();
  if (!focus && tabs.length > 0) {
    throw new Error("Config must define [layout].focus.");
  }

  return {
    projects: {
      roots,
      git_only: gitOnly,
      depth,
    },
    ui: resolveUiConfig(pluginConfig),
    layout: {
      focus: focus ?? "",
    },
    tabs,
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

function buildTabs(
  config: RawConfig | undefined,
  options: { required: boolean } = { required: true }
): TabConfig[] {
  const rawTabs = config?.tabs;
  if (!rawTabs || Object.keys(rawTabs).length === 0) {
    if (!options.required) {
      return [];
    }
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
    "[ui]",
    "# How Sessionizer / Worktree pickers open in Herdr: overlay | split | popup",
    "# popup requires Herdr >= 0.7.4 (width/height only apply to popup)",
    'placement = "popup"',
    'width = "90%"',
    'height = "90%"',
    "",
    "[layout]",
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

function resolveUiConfig(config: RawConfig | undefined): UiConfig {
  const placement = asPlacement(config?.ui?.placement);
  const width = asOptionalPopupSize(config?.ui?.width, "width");
  const height = asOptionalPopupSize(config?.ui?.height, "height");

  if ((width !== undefined || height !== undefined) && placement !== "popup") {
    throw new Error(
      'Config [ui].width and [ui].height are only valid when [ui].placement = "popup".'
    );
  }

  return {
    placement,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

function asPlacement(value: string | undefined): PanePlacement {
  if (value === undefined) return "overlay";
  if (value === "overlay" || value === "split" || value === "popup") {
    return value;
  }
  throw new Error(
    "Config must define [ui].placement as 'overlay', 'split', or 'popup'."
  );
}

function asOptionalPopupSize(
  value: unknown,
  field: "width" | "height"
): number | string | undefined {
  if (value === undefined) return undefined;

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 65535) {
      throw new Error(
        `Config [ui].${field} must be an integer cell count from 0 to 65535, or a percentage like "80%".`
      );
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^(100|[1-9][0-9]?)%$/.test(trimmed)) {
      return trimmed;
    }
    throw new Error(
      `Config [ui].${field} must be an integer cell count from 0 to 65535, or a percentage like "80%".`
    );
  }

  throw new Error(
    `Config [ui].${field} must be an integer cell count from 0 to 65535, or a percentage like "80%".`
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
