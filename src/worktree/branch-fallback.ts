import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

import {
  expandHome,
  normalizePath,
  worktreeSlug,
} from "../discovery/discovery.ts";

import { parse } from "smol-toml";

interface RawHerdrConfig {
  worktrees?: {
    directory?: string;
  };
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ExistingPathInspection {
  valid: boolean;
  repoRoot?: string;
  branch?: string;
}

interface WorktreeBranchFallbackRuntime {
  runGit(cwd: string, args: string[]): Promise<GitCommandResult>;
  pathExists(path: string): boolean;
}

const defaultRuntime: WorktreeBranchFallbackRuntime = {
  runGit,
  pathExists: existsSync,
};

export async function attachExistingBranchWorktree(
  project: string,
  branch: string,
  runtime: WorktreeBranchFallbackRuntime = defaultRuntime
): Promise<string> {
  const repoRoot = await resolveRepoRoot(project, runtime);
  const path = resolveHerdrWorktreePath(repoRoot, branch);

  const result = await runtime.runGit(repoRoot, [
    "worktree",
    "add",
    path,
    branch,
  ]);
  if (result.exitCode === 0) {
    return path;
  }

  if (result.stderr.includes("already exists") && runtime.pathExists(path)) {
    const inspection = await inspectExistingPath(path, runtime);
    if (
      inspection.valid &&
      normalizePath(inspection.repoRoot) === normalizePath(repoRoot) &&
      inspection.branch === branch
    ) {
      return path;
    }

    throw new Error(
      `target worktree path '${path}' already exists but is not a reusable checkout for branch '${branch}'; remove or relocate that directory and retry`
    );
  }

  throw new Error(
    result.stderr.trim() ||
      result.stdout.trim() ||
      `git worktree add failed for branch '${branch}'`
  );
}

function resolveHerdrWorktreePath(repoRoot: string, branch: string): string {
  return join(
    resolveHerdrWorktreesDirectory(),
    basename(repoRoot),
    worktreeSlug(branch)
  );
}

function resolveHerdrWorktreesDirectory(): string {
  const configPath =
    process.env.HERDR_CONFIG_PATH ??
    join(homedir(), ".config", "herdr", "config.toml");
  if (!existsSync(configPath)) {
    return join(homedir(), ".herdr", "worktrees");
  }

  const raw = parse(readFileSync(configPath, "utf-8")) as RawHerdrConfig;
  return expandHome(raw.worktrees?.directory?.trim() || "~/.herdr/worktrees");
}

async function resolveRepoRoot(
  project: string,
  runtime: WorktreeBranchFallbackRuntime
): Promise<string> {
  const result = await runtime.runGit(project, [
    "rev-parse",
    "--show-toplevel",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || `failed to resolve git root for '${project}'`
    );
  }

  return result.stdout.trim();
}

async function inspectExistingPath(
  path: string,
  runtime: WorktreeBranchFallbackRuntime
): Promise<ExistingPathInspection> {
  const repo = await runtime.runGit(path, ["rev-parse", "--show-toplevel"]);
  if (repo.exitCode !== 0) {
    return { valid: false };
  }

  const branch = await runtime.runGit(path, ["branch", "--show-current"]);
  if (branch.exitCode !== 0) {
    return { valid: false, repoRoot: repo.stdout.trim() };
  }

  return {
    valid: true,
    repoRoot: repo.stdout.trim(),
    branch: branch.stdout.trim(),
  };
}

async function runGit(cwd: string, args: string[]): Promise<GitCommandResult> {
  const proc = Bun.spawn(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}
