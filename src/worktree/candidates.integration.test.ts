// Integration tests for fetchPullRequestHead: real git in a tmpdir sandbox.
// These are NOT part of the default `bun test` run (see package.json
// `--path-ignore-patterns`): the pre-commit hook exports GIT_DIR, which would
// redirect the production runGit calls here into the parent repository. CI has
// no such env, so `bun run test:integration` runs them safely.

import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fetchPullRequestHead } from "./candidates.ts";

describe("fetchPullRequestHead", () => {
  // Unique per-process sandbox: real git operations in tmpdir must never
  // share state (e.g. a leftover registered worktree) across runs.
  const sandbox = mkdtempSync(
    join(tmpdir(), "herdr-sessionizer-test-pr-fetch-")
  );
  const origin = join(sandbox, "origin.git");
  const repo = join(sandbox, "repo");
  const worktree = join(sandbox, "wt");

  function git(dir: string, args: string[]): string {
    const result = spawnSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      // Explicit env: the sandbox must be self-contained regardless of any
      // ambient git env (e.g. GIT_DIR) in the parent process.
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG,
      },
    });
    if (result.status !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed in ${dir}: ${result.stderr}`
      );
    }
    return result.stdout.trim();
  }

  function commit(path: string, file: string, contents: string): string {
    writeFileSync(join(path, file), contents);
    git(path, ["add", file]);
    git(path, ["commit", "-qm", file]);
    return git(path, ["rev-parse", "HEAD"]);
  }

  /** Simulates a GitHub origin with a `refs/pull/29/head` PR head ref. */
  function setup(): string {
    rmSync(sandbox, { recursive: true, force: true });
    mkdirSync(origin, { recursive: true });
    mkdirSync(repo, { recursive: true });
    git(origin, ["init", "--bare", "-q"]);
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    git(repo, ["branch", "-M", "main"]);
    const base = commit(repo, "a.txt", "a\n");
    git(repo, ["remote", "add", "origin", origin]);
    git(repo, ["push", "-q", "origin", "main"]);
    // PR head = one commit ahead of main (a contributor push)
    const tip = commit(repo, "b.txt", "b\n");
    git(repo, ["push", "-q", "origin", "HEAD:refs/pull/29/head"]);
    expect(tip).not.toBe(base);
    return tip;
  }

  it("materializes pr-N at the PR head tip and sets an upstream so git pull works", async () => {
    const tip = setup();

    await fetchPullRequestHead(repo, 29);

    expect(git(repo, ["rev-parse", "refs/heads/pr-29"])).toBe(tip);
    expect(git(repo, ["config", "branch.pr-29.remote"])).toBe("origin");
    expect(git(repo, ["config", "branch.pr-29.merge"])).toBe(
      "refs/pull/29/head"
    );

    // worktrees share the main repo config, so `git pull` works there
    git(repo, ["worktree", "add", "-q", worktree, "pr-29"]);
    git(worktree, ["pull", "--ff-only"]);
    expect(git(worktree, ["rev-parse", "HEAD"])).toBe(tip);

    // a later contributor push is picked up by a plain `git pull`
    const tip2 = commit(repo, "c.txt", "c\n");
    git(repo, ["push", "-q", "origin", "HEAD:refs/pull/29/head"]);
    git(worktree, ["pull", "--ff-only"]);
    expect(git(worktree, ["rev-parse", "HEAD"])).toBe(tip2);
    expect(git(worktree, ["log", "--oneline", "-1"])).toContain("c.txt");
  });

  it("throws when the PR head ref is missing, without touching config", async () => {
    setup();

    expect(fetchPullRequestHead(repo, 404)).rejects.toThrow();
    expect(git(repo, ["for-each-ref", "refs/heads/pr-404"])).toBe("");
  });
});
