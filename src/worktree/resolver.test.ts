import { describe, expect, it, mock } from "bun:test";

import { HerdrError } from "../client/errors.ts";
import {
  existingWorktreePathFromError,
  existingWorktreePathFromPorcelainByBranch,
  existingWorktreePathFromPorcelainBySlug,
  WorktreeResolver,
} from "./resolver.ts";

describe("existingWorktreePathFromError", () => {
  it("extracts the worktree path from herdr stderr", () => {
    const error = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: '/tmp/foo' is already used by worktree at '/tmp/bar'"
    );

    expect(existingWorktreePathFromError(error)).toBe("/tmp/bar");
  });

  it("returns undefined when stderr does not include an existing path", () => {
    const error = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: some other git error"
    );

    expect(existingWorktreePathFromError(error)).toBeUndefined();
  });
});

describe("existingWorktreePathFromPorcelainByBranch", () => {
  it("finds the worktree path for the matching branch ref", () => {
    const porcelain = [
      "worktree /repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /repo-feature",
      "HEAD def456",
      "branch refs/heads/feature/test-flow",
      "",
    ].join("\n");

    expect(
      existingWorktreePathFromPorcelainByBranch(porcelain, "feature/test-flow")
    ).toBe("/repo-feature");
  });

  it("returns undefined when the branch ref is not present", () => {
    const porcelain = ["worktree /repo", "branch refs/heads/main", ""].join(
      "\n"
    );

    expect(
      existingWorktreePathFromPorcelainByBranch(porcelain, "feature/test-flow")
    ).toBeUndefined();
  });
});

describe("existingWorktreePathFromPorcelainBySlug", () => {
  it("matches an existing worktree path by slugged basename", () => {
    const porcelain = [
      "worktree /repo/feature-test-flow",
      "branch refs/heads/something-else",
      "",
    ].join("\n");

    expect(
      existingWorktreePathFromPorcelainBySlug(porcelain, "feature/test flow")
    ).toBe("/repo/feature-test-flow");
  });

  it("returns undefined when no worktree basename matches the branch slug", () => {
    const porcelain = [
      "worktree /repo/main",
      "branch refs/heads/main",
      "",
    ].join("\n");

    expect(
      existingWorktreePathFromPorcelainBySlug(porcelain, "feature/test-flow")
    ).toBeUndefined();
  });
});

describe("WorktreeResolver", () => {
  it("returns the error-derived path without listing git worktrees", async () => {
    const listWorktrees = mock(() => Promise.resolve(undefined));
    const resolver = new WorktreeResolver(listWorktrees);
    const error = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: branch is already used by worktree at '/tmp/existing'"
    );

    await expect(
      resolver.resolveExisting({
        project: "/repo",
        branch: "feature/test-flow",
        error,
      })
    ).resolves.toEqual({
      path: "/tmp/existing",
      source: "error",
    });
    expect(listWorktrees).not.toHaveBeenCalled();
  });

  it("falls back to git porcelain branch matching for duplicate branch errors", async () => {
    const listWorktrees = mock(() =>
      Promise.resolve(
        [
          "worktree /repo/feature-test-flow",
          "branch refs/heads/feature/test-flow",
          "",
        ].join("\n")
      )
    );
    const resolver = new WorktreeResolver(listWorktrees);
    const error = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: a branch named 'feature/test-flow' already exists"
    );

    await expect(
      resolver.resolveExisting({
        project: "/repo",
        branch: "feature/test-flow",
        error,
      })
    ).resolves.toEqual({
      path: "/repo/feature-test-flow",
      source: "git-branch",
    });
    expect(listWorktrees).toHaveBeenCalledWith("/repo");
  });

  it("falls back to slug matching when branch refs are unavailable", async () => {
    const listWorktrees = mock(() =>
      Promise.resolve(
        [
          "worktree /repo/feature-test-flow",
          "branch refs/heads/detached",
          "",
        ].join("\n")
      )
    );
    const resolver = new WorktreeResolver(listWorktrees);
    const error = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: a branch named 'feature/test flow' already exists"
    );

    await expect(
      resolver.resolveExisting({
        project: "/repo",
        branch: "feature/test flow",
        error,
      })
    ).resolves.toEqual({
      path: "/repo/feature-test-flow",
      source: "git-slug",
    });
  });

  it("can resolve from git porcelain without an error hint", async () => {
    const listWorktrees = mock(() =>
      Promise.resolve(
        [
          "worktree /repo/feature-test-flow",
          "branch refs/heads/feature/test-flow",
          "",
        ].join("\n")
      )
    );
    const resolver = new WorktreeResolver(listWorktrees);

    await expect(
      resolver.resolveExisting({
        project: "/repo",
        branch: "feature/test-flow",
      })
    ).resolves.toEqual({
      path: "/repo/feature-test-flow",
      source: "git-branch",
    });
  });

  it("returns undefined for unrelated errors", async () => {
    const listWorktrees = mock(() =>
      Promise.resolve(
        ["worktree /repo/main", "branch refs/heads/main", ""].join("\n")
      )
    );
    const resolver = new WorktreeResolver(listWorktrees);
    const error = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: unrelated error"
    );

    await expect(
      resolver.resolveExisting({
        project: "/repo",
        branch: "feature/test-flow",
        error,
      })
    ).resolves.toBeUndefined();
    expect(listWorktrees).not.toHaveBeenCalled();
  });
});
