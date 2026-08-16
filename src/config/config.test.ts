import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadConfig,
  REPO_LAYOUT_CONFIG_RELATIVE,
  resolveLayoutConfig,
  resolveRepoLayoutPath,
  type SessionizerConfig,
} from "./config.ts";

function globalConfig(): SessionizerConfig {
  return {
    projects: { roots: ["/projects"], git_only: false, depth: 1 },
    ui: { placement: "overlay" },
    layout: { focus: "editor" },
    worktree: { fetch_on_open: false },
    tabs: [
      {
        id: "dev",
        label: "dev",
        panes: [
          { id: "editor", title: "nvim", command: "nvim" },
          {
            id: "agent",
            from: "editor",
            title: "agent",
            split: "right",
            command: "opencode",
          },
        ],
      },
    ],
  };
}

function writeRepoLayout(repoRoot: string, contents: string): string {
  const configDir = join(repoRoot, ".sessionizer");
  mkdirSync(configDir, { recursive: true });
  const configPath = join(configDir, "config.toml");
  writeFileSync(configPath, contents, "utf-8");
  return configPath;
}

function minimalGlobalConfig(projects: string[]): string {
  return [
    "[projects]",
    ...projects,
    "",
    "[ui]",
    'placement = "overlay"',
    "",
    "[layout]",
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
  ].join("\n");
}

function withPluginConfigDir<T>(callback: (dir: string) => T): T {
  const previous = process.env.HERDR_PLUGIN_CONFIG_DIR;
  const dir = mkdtempSync(join(tmpdir(), "sessionizer-config-"));
  process.env.HERDR_PLUGIN_CONFIG_DIR = dir;

  try {
    return callback(dir);
  } finally {
    if (previous === undefined) {
      delete process.env.HERDR_PLUGIN_CONFIG_DIR;
    } else {
      process.env.HERDR_PLUGIN_CONFIG_DIR = previous;
    }
  }
}

describe("loadConfig", () => {
  it("defaults git_only to false when omitted from an existing config", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        minimalGlobalConfig(['roots = ["~/Projects"]']),
        "utf-8"
      );

      const config = loadConfig();

      expect(config.projects.git_only).toBe(false);
      expect(config.projects.depth).toBe(1);
    });
  });

  it("defaults git_only to true for a newly generated global config", () => {
    withPluginConfigDir(() => {
      const config = loadConfig();

      expect(config.projects.git_only).toBe(true);
      expect(config.projects.depth).toBe(1);
      expect(config.ui).toEqual({
        placement: "overlay",
      });
    });
  });

  it("loads git_only before depth from project config", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        minimalGlobalConfig([
          'roots = ["~/Projects"]',
          "git_only = true",
          "depth = 3",
        ]),
        "utf-8"
      );

      const config = loadConfig();

      expect(config.projects.git_only).toBe(true);
      expect(config.projects.depth).toBe(3);
    });
  });

  it("defaults worktree.fetch_on_open to false", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        minimalGlobalConfig(['roots = ["/repo"]']),
        "utf-8"
      );

      const config = loadConfig();

      expect(config.worktree.fetch_on_open).toBe(false);
    });
  });

  it("parses worktree.fetch_on_open = true", () => {
    withPluginConfigDir((dir) => {
      const contents = [
        "[projects]",
        'roots = ["/repo"]',
        "",
        "[layout]",
        'focus = "editor"',
        "",
        "[worktree]",
        "fetch_on_open = true",
      ].join("\n");
      writeFileSync(join(dir, "config.toml"), contents, "utf-8");

      const config = loadConfig();

      expect(config.worktree.fetch_on_open).toBe(true);
    });
  });
});

describe("resolveLayoutConfig", () => {
  it("loads a projects-only config without [layout] or [tabs] sections", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        ["[projects]", 'roots = ["~/Projects"]', ""].join("\n"),
        "utf-8"
      );

      const config = loadConfig();

      expect(config.tabs).toEqual([]);
      expect(config.ui.placement).toBe("overlay");
      expect(config.layout.focus).toBe("");
    });
  });

  it("still requires [layout].focus when [tabs] sections exist", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        [
          "[projects]",
          'roots = ["~/Projects"]',
          "",
          "[ui]",
          'placement = "overlay"',
          "",
          "[tabs.dev]",
          'label = "dev"',
          "",
          "[[tabs.dev.panes]]",
          'title = "nvim"',
          'command = "nvim"',
          "",
        ].join("\n"),
        "utf-8"
      );

      expect(() => loadConfig()).toThrow("Config must define [layout].focus.");
    });
  });

  it("defaults [ui].placement to overlay when omitted", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        [
          "[projects]",
          'roots = ["~/Projects"]',
          "",
          "[layout]",
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
        ].join("\n"),
        "utf-8"
      );

      expect(loadConfig().ui.placement).toBe("overlay");
    });
  });

  it("reads [ui].placement including popup sizing", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        [
          "[projects]",
          'roots = ["~/Projects"]',
          "",
          "[ui]",
          'placement = "popup"',
          'width = "80%"',
          "height = 24",
          "",
          "[layout]",
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
        ].join("\n"),
        "utf-8"
      );

      expect(loadConfig().ui).toEqual({
        placement: "popup",
        width: "80%",
        height: 24,
      });
    });
  });

  it("ignores legacy [layout].placement and defaults to overlay", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        [
          "[projects]",
          'roots = ["~/Projects"]',
          "",
          "[layout]",
          'placement = "split"',
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
        ].join("\n"),
        "utf-8"
      );

      // Unknown keys under [layout] are ignored; placement only lives under [ui].
      expect(loadConfig().ui.placement).toBe("overlay");
    });
  });

  it("rejects popup size when placement is not popup", () => {
    withPluginConfigDir((dir) => {
      writeFileSync(
        join(dir, "config.toml"),
        [
          "[projects]",
          'roots = ["~/Projects"]',
          "",
          "[ui]",
          'placement = "overlay"',
          'width = "80%"',
          "",
          "[layout]",
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
        ].join("\n"),
        "utf-8"
      );

      expect(() => loadConfig()).toThrow(
        'Config [ui].width and [ui].height are only valid when [ui].placement = "popup".'
      );
    });
  });

  it("uses repo-local focus and tabs when override exists", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      [
        "[layout]",
        'focus = "wiki"',
        "",
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        'command = "lazygit"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "agent"',
        'from = "git"',
        'title = "agent"',
        'split = "right"',
        "ratio = 0.3",
        'command = "pi"',
        "",
      ].join("\n")
    );

    const resolved = resolveLayoutConfig(repoRoot, globalConfig());

    expect(resolved.ui.placement).toBe("overlay");
    expect(resolved.layout.focus).toBe("wiki");
    expect(resolved.tabs).toEqual([
      {
        id: "wiki",
        label: "wiki",
        panes: [
          {
            id: "git",
            from: undefined,
            title: "lazygit",
            split: undefined,
            command: "lazygit",
            accept_command_override: false,
          },
          {
            id: "agent",
            from: "git",
            title: "agent",
            split: "right",
            ratio: 0.3,
            command: "pi",
            accept_command_override: false,
          },
        ],
      },
    ]);
    expect(resolved.projects).toEqual(globalConfig().projects);
    expect(configPath).toBe(resolveRepoLayoutPath(repoRoot));
    expect(REPO_LAYOUT_CONFIG_RELATIVE).toBe(".sessionizer/config.toml");
  });

  it("falls back to global focus and tabs when override is missing", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));

    const resolved = resolveLayoutConfig(repoRoot, globalConfig());

    expect(resolved).toEqual(globalConfig());
  });

  it("throws with the repo-local path when TOML is invalid", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(repoRoot, "not valid toml [[[");

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      configPath
    );
  });

  it("throws with the repo-local path when focus is missing", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      [
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        'command = "lazygit"',
        "",
      ].join("\n")
    );

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      `Repo layout config must define [layout].focus. (${configPath})`
    );
  });

  it("throws with the repo-local path when tabs are missing", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      ["[layout]", 'focus = "wiki"', ""].join("\n")
    );

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      `Config must define at least one [tabs.<name>] section. (${configPath})`
    );
  });

  it("throws with the repo-local path when a ratio is not numeric", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      [
        "[layout]",
        'focus = "wiki"',
        "",
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        'command = "lazygit"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "agent"',
        'from = "git"',
        'title = "agent"',
        'split = "right"',
        'ratio = "narrow"',
        'command = "pi"',
        "",
      ].join("\n")
    );

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      `Tab 'wiki' pane 2 ratio must be a finite number between 0 and 1. (${configPath})`
    );
  });

  it("throws with the repo-local path when a ratio is out of range", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      [
        "[layout]",
        'focus = "wiki"',
        "",
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        'command = "lazygit"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "agent"',
        'from = "git"',
        'title = "agent"',
        'split = "right"',
        "ratio = 1.2",
        'command = "pi"',
        "",
      ].join("\n")
    );

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      `Tab 'wiki' pane 2 ratio must be greater than 0 and less than 1. (${configPath})`
    );
  });

  it("throws with the repo-local path when a ratio is exactly zero", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      [
        "[layout]",
        'focus = "wiki"',
        "",
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        'command = "lazygit"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "agent"',
        'from = "git"',
        'title = "agent"',
        'split = "right"',
        "ratio = 0",
        'command = "pi"',
        "",
      ].join("\n")
    );

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      `Tab 'wiki' pane 2 ratio must be greater than 0 and less than 1. (${configPath})`
    );
  });

  it("throws with the repo-local path when a ratio is exactly one", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      [
        "[layout]",
        'focus = "wiki"',
        "",
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        'command = "lazygit"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "agent"',
        'from = "git"',
        'title = "agent"',
        'split = "right"',
        "ratio = 1",
        'command = "pi"',
        "",
      ].join("\n")
    );

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      `Tab 'wiki' pane 2 ratio must be greater than 0 and less than 1. (${configPath})`
    );
  });

  it("throws with the repo-local path when the first pane sets a ratio", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "sessionizer-repo-"));
    const configPath = writeRepoLayout(
      repoRoot,
      [
        "[layout]",
        'focus = "wiki"',
        "",
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        "ratio = 0.5",
        'command = "lazygit"',
        "",
      ].join("\n")
    );

    expect(() => resolveLayoutConfig(repoRoot, globalConfig())).toThrow(
      `Tab 'wiki' cannot set 'ratio' on its first pane. (${configPath})`
    );
  });
});
