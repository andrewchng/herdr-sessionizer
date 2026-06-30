import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  REPO_LAYOUT_CONFIG_RELATIVE,
  resolveLayoutConfig,
  resolveRepoLayoutPath,
  type SessionizerConfig,
} from "./config.ts";

function globalConfig(): SessionizerConfig {
  return {
    projects: { roots: ["/projects"] },
    layout: { placement: "overlay", focus: "editor" },
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

describe("resolveLayoutConfig", () => {
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

    expect(resolved.layout.placement).toBe("overlay");
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
