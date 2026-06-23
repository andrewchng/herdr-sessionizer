import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { expandHome } from "./discovery.ts";

import { parse } from "smol-toml";

type PanePlacement = "overlay" | "split";
type SplitDirection = "right" | "down";

interface RawPaneConfig {
  id?: string;
  from?: string;
  title?: string;
  split?: string;
  command?: string;
  accept_command_override?: boolean;
}

interface RawTabConfig {
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
  accept_command_override?: boolean;
}

export interface TabConfig {
  id: string;
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

  const focus = pluginConfig?.layout?.focus?.trim();
  if (!focus) {
    throw new Error("Config must define [layout].focus.");
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
  return rawPanes.map((pane, index) => ({
    id: pane.id?.trim() || undefined,
    from: pane.from?.trim() || undefined,
    title: pane.title?.trim() ?? "",
    split:
      index === 0 && !pane.from
        ? undefined
        : asOptionalSplitDirection(pane.split),
    command: pane.command ?? "",
    accept_command_override: pane.accept_command_override ?? false,
  }));
}

function defaultConfigToml(): string {
  return [
    "[projects]",
    "# Parent folders searched by the interactive pickers",
    `roots = ["~/Projects", "~/Workspace"]`,
    "",
    "[layout]",
    "# How the plugin pane itself opens: overlay | split",
    'placement = "overlay"',
    "# Which pane or tab to focus after layout creation",
    'focus = "assistant"',
    "",
    "[tabs.terminal]",
    'label = "terminal"',
    "",
    "[[tabs.terminal.panes]]",
    "# Root pane in this tab",
    'id = "shell"',
    'title = "shell"',
    'command = ""',
    "",
    "[[tabs.terminal.panes]]",
    "# Split from shell and run another command",
    'id = "assistant"',
    'from = "shell"',
    'title = "assistant"',
    'split = "right"',
    'command = "opencode"',
    "# Optional: let worktree --command replace this pane command with a raw override.",
    "accept_command_override = true",
    "",
    "[tabs.editor]",
    'label = "editor"',
    "",
    "[[tabs.editor.panes]]",
    "# Editor pane",
    'id = "editor"',
    'title = "editor"',
    'command = "nvim"',
    "",
    "[tabs.server]",
    'label = "server"',
    "",
    "[[tabs.server.panes]]",
    "# Server or setup pane",
    'id = "server"',
    'title = "server"',
    'command = ""',
    "",
  ].join("\n");
}

function asPlacement(value: string | undefined): PanePlacement {
  if (value === "overlay" || value === "split") return value;
  throw new Error(
    "Config must define [layout].placement as 'overlay' or 'split'."
  );
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
