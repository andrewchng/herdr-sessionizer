import {
  mkdirSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";

import {
  expandHome,
  listProjects,
  normalizePath,
  sanitizeName,
  shellQuote,
  worktreeSlug,
} from "./discovery.ts";

// ── sanitizeName ──────────────────────────────────────────────

describe("sanitizeName", () => {
  it("preserves alphanumeric, underscore, and hyphen characters", () => {
    expect(sanitizeName("hello_world-123")).toBe("hello_world-123");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeName("my branch")).toBe("my_branch");
  });

  it("replaces dots and slashes with underscores", () => {
    expect(sanitizeName("feature/feat.ui")).toBe("feature_feat_ui");
  });

  it("replaces special characters with underscores", () => {
    expect(sanitizeName("foo@bar!baz")).toBe("foo_bar_baz");
  });

  it("handles empty string", () => {
    expect(sanitizeName("")).toBe("");
  });
});

// ── normalizePath ──────────────────────────────────────────────

describe("normalizePath", () => {
  it("returns empty string for undefined", () => {
    expect(normalizePath(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizePath("")).toBe("");
  });

  it("strips trailing slashes", () => {
    expect(normalizePath("/home/user/projects/")).toBe("/home/user/projects");
  });

  it("strips multiple trailing slashes", () => {
    expect(normalizePath("/a/b///")).toBe("/a/b");
  });

  it("leaves paths without trailing slashes unchanged", () => {
    expect(normalizePath("/home/user/projects")).toBe("/home/user/projects");
  });

  it("handles root path with trailing slash", () => {
    expect(normalizePath("/")).toBe("");
  });
});

// ── expandHome ──────────────────────────────────────────────

describe("expandHome", () => {
  it("expands ~/ to the home directory", () => {
    const result = expandHome("~/Projects");
    expect(result).toStartWith("/");
    expect(result).toEndWith("/Projects");
    expect(result).not.toInclude("~");
  });

  it("leaves paths without ~ unchanged", () => {
    expect(expandHome("/absolute/path")).toBe("/absolute/path");
  });

  it("leaves relative paths without ~ unchanged", () => {
    expect(expandHome("relative/path")).toBe("relative/path");
  });

  it("expands only leading ~/", () => {
    const result = expandHome("~/foo");
    expect(result).toStartWith("/");
    expect(result).toEndWith("/foo");
  });
});

// ── shellQuote ──────────────────────────────────────────────

describe("shellQuote", () => {
  it("wraps a plain string in single quotes", () => {
    expect(shellQuote("/home/project")).toBe("'/home/project'");
  });

  it("escapes embedded single quotes", () => {
    const result = shellQuote("it's a test");
    expect(result).toStartWith("'");
    expect(result).toEndWith("'");
    expect(result).toInclude("'\\''");
  });

  it("handles empty string", () => {
    expect(shellQuote("")).toBe("''");
  });

  it("handles string with spaces", () => {
    expect(shellQuote("/a/b /c")).toBe("'/a/b /c'");
  });
});

// ── worktreeSlug ──────────────────────────────────────────────

describe("worktreeSlug", () => {
  it("replaces non-alphanumeric sequences with hyphens", () => {
    expect(worktreeSlug("feature/my branch")).toBe("feature-my-branch");
  });

  it("lowercases the result", () => {
    expect(worktreeSlug("FEATURE/BRANCH")).toBe("feature-branch");
  });

  it("strips leading and trailing hyphens", () => {
    expect(worktreeSlug("!feature!")).toBe("feature");
  });

  it("handles already-clean branch names", () => {
    expect(worktreeSlug("main")).toBe("main");
  });

  it("collapses multiple consecutive separators", () => {
    expect(worktreeSlug("feature@@branch..name")).toBe("feature-branch-name");
  });

  it("handles empty string", () => {
    expect(worktreeSlug("")).toBe("");
  });
});

// ── listProjects ──────────────────────────────────────────────

// Helper: create a sandbox with known subdirectories and a file
function setupSandbox(): string {
  const sandbox = join(tmpdir(), "herdr-sessionizer-test-discovery");
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  mkdirSync(join(sandbox, "project-a"), { recursive: true });
  mkdirSync(join(sandbox, "project-b"), { recursive: true });
  mkdirSync(join(sandbox, "project-c"), { recursive: true });
  writeFileSync(join(sandbox, "not-a-project.txt"), "ignored");
  return sandbox;
}

describe("listProjects", () => {
  const sandbox = setupSandbox();

  it("lists immediate directories under the given roots", () => {
    const projects = listProjects([sandbox]);
    expect(projects).toHaveLength(3);
    expect(projects).toContain(join(sandbox, "project-a"));
    expect(projects).toContain(join(sandbox, "project-b"));
    expect(projects).toContain(join(sandbox, "project-c"));
  });

  it("excludes files (non-directories)", () => {
    const projects = listProjects([sandbox]);
    for (const p of projects) {
      expect(p.endsWith("not-a-project.txt")).toBe(false);
    }
  });

  it("skips non-existent base paths silently", () => {
    const projects = listProjects([sandbox, "/nonexistent/path"]);
    expect(projects).toHaveLength(3);
  });

  it("returns empty array when no bases exist", () => {
    expect(listProjects(["/nonexistent/path"])).toEqual([]);
  });

  it("returns results sorted alphabetically", () => {
    const projects = listProjects([sandbox]);
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i]! >= projects[i - 1]!).toBe(true);
    }
  });

  it("discovers projects from multiple base roots", () => {
    const extraRoot = join(tmpdir(), "herdr-sessionizer-extra");
    rmSync(extraRoot, { recursive: true, force: true });
    mkdirSync(extraRoot, { recursive: true });
    mkdirSync(join(extraRoot, "project-d"), { recursive: true });

    try {
      const projects = listProjects([sandbox, extraRoot]);
      expect(projects).toHaveLength(4);
      expect(projects).toContain(join(extraRoot, "project-d"));
    } finally {
      rmSync(join(extraRoot, "project-d"), { recursive: true, force: true });
      rmSync(extraRoot, { recursive: true, force: true });
    }
  });

  it("filters to immediate git repos when git_only is enabled with default depth", () => {
    const repoRoot = join(sandbox, "repo-root");
    const nestedRepo = join(sandbox, "group", "nested-repo");
    mkdirSync(join(repoRoot, ".git"), { recursive: true });
    mkdirSync(join(nestedRepo, ".git"), { recursive: true });

    const projects = listProjects([sandbox], { git_only: true });

    expect(projects).toEqual([repoRoot]);
  });

  it("uses depth when git_only is enabled", () => {
    const nestedRepo = join(sandbox, "org", "team", "service");
    mkdirSync(join(nestedRepo, ".git"), { recursive: true });

    expect(listProjects([sandbox], { git_only: true, depth: 2 })).not.toContain(
      nestedRepo
    );
    expect(listProjects([sandbox], { git_only: true, depth: 3 })).toContain(
      nestedRepo
    );
  });

  it("includes symlinked git repos when git_only is enabled", () => {
    const external = join(tmpdir(), "herdr-sessionizer-external-repo");
    const link = join(sandbox, "linked-repo");
    rmSync(external, { recursive: true, force: true });
    rmSync(link, { recursive: true, force: true });
    mkdirSync(join(external, ".git"), { recursive: true });
    symlinkSync(external, link, "dir");

    try {
      expect(listProjects([sandbox], { git_only: true })).toContain(link);
    } finally {
      rmSync(link, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });
});

// ── listProjects with globs ───────────────────────────────────

// Helper: create a sandbox with a/b/x/y layout, a nested project, and a
// file that globs must not surface as a project.
function setupGlobSandbox(): string {
  const sandbox = join(tmpdir(), "herdr-sessionizer-test-globs");
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  for (const dir of ["a/x", "a/y", "b/x", "b/y", "a/nested/proj"]) {
    mkdirSync(join(sandbox, dir), { recursive: true });
  }
  writeFileSync(join(sandbox, "a", "globmatch.txt"), "ignored");
  return sandbox;
}

describe("listProjects with globs", () => {
  const sandbox = setupGlobSandbox();

  it("expands `*` over owners and scans their children", () => {
    const projects = listProjects([join(sandbox, "*")]);
    expect(projects).toHaveLength(5);
    expect(projects).toContain(join(sandbox, "a", "nested"));
    expect(projects).toContain(join(sandbox, "a", "x"));
    expect(projects).toContain(join(sandbox, "a", "y"));
    expect(projects).toContain(join(sandbox, "b", "x"));
    expect(projects).toContain(join(sandbox, "b", "y"));
  });

  it("expands `**` recursively, surfacing nested children", () => {
    // Create a child under a/nested/proj so `**` reaches it; remove after.
    const child = join(sandbox, "a", "nested", "proj", "child");
    mkdirSync(child, { recursive: true });
    try {
      const projects = listProjects([join(sandbox, "**")]);
      expect(projects).toContain(join(sandbox, "a", "nested", "proj"));
      expect(projects).toContain(child);
    } finally {
      rmSync(child, { recursive: true, force: true });
    }
  });

  it("returns an empty array for a zero-match glob", () => {
    expect(listProjects([join(sandbox, "no-such-prefix-*")])).toEqual([]);
  });

  it("excludes files matched by a glob", () => {
    // `a/*` matches globmatch.txt but only directories become bases; the
    // file is filtered out and discovery does not throw.
    const projects = listProjects([join(sandbox, "a", "*")]);
    expect(projects).toEqual([join(sandbox, "a", "nested", "proj")]);
    for (const p of projects) {
      expect(p.endsWith("globmatch.txt")).toBe(false);
    }
  });

  it("dedupes glob and plain roots that overlap", () => {
    const projects = listProjects([
      join(sandbox, "a", "*"),
      join(sandbox, "*"),
    ]);
    // a/* contributes a/nested/proj; * contributes the five child dirs;
    // no duplicates despite overlapping regions.
    expect(projects).toHaveLength(6);
    expect(new Set(projects).size).toBe(6);
  });

  it("does not throw when a glob base is missing and continues with the rest", () => {
    const projects = listProjects([
      join(sandbox, "does-not-exist", "*"),
      join(sandbox, "*"),
    ]);
    expect(projects).toHaveLength(5);
    expect(projects).toContain(join(sandbox, "a", "x"));
  });

  it("composes glob expansion with git_only and depth (ghq layout)", () => {
    // Fresh sandbox modelling <host>/<owner>/<repo> with a non-repo child
    // that git_only must skip.
    const hostRoot = join(tmpdir(), "herdr-sessionizer-test-globs-ghq");
    rmSync(hostRoot, { recursive: true, force: true });
    mkdirSync(join(hostRoot, "owner-a", "repo-x", ".git"), { recursive: true });
    mkdirSync(join(hostRoot, "owner-b", "repo-y", ".git"), { recursive: true });
    mkdirSync(join(hostRoot, "owner-a", "not-a-repo"), { recursive: true });

    try {
      const projects = listProjects([join(hostRoot, "*")], {
        git_only: true,
        depth: 1,
      });
      expect(projects).toEqual([
        join(hostRoot, "owner-a", "repo-x"),
        join(hostRoot, "owner-b", "repo-y"),
      ]);
      expect(projects).not.toContain(join(hostRoot, "owner-a"));
      expect(projects).not.toContain(join(hostRoot, "owner-b"));
      expect(projects).not.toContain(join(hostRoot, "owner-a", "not-a-repo"));
    } finally {
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });
});
