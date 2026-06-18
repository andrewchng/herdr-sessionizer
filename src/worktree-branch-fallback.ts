import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';

import { expandHome, worktreeSlug } from './discovery.ts';

import { parse } from 'smol-toml';

interface RawHerdrConfig {
  worktrees?: {
    directory?: string;
  };
}

export async function attachExistingBranchWorktree(project: string, branch: string): Promise<string> {
  const repoRoot = await resolveRepoRoot(project);
  const path = resolveHerdrWorktreePath(repoRoot, branch);

  mkdirSync(dirname(path), { recursive: true });

  const proc = Bun.spawn(['git', '-C', repoRoot, 'worktree', 'add', path, branch], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git worktree add failed for branch '${branch}'`);
  }

  return path;
}

function resolveHerdrWorktreePath(repoRoot: string, branch: string): string {
  return join(resolveHerdrWorktreesDirectory(), basename(repoRoot), worktreeSlug(branch));
}

function resolveHerdrWorktreesDirectory(): string {
  const configPath = process.env.HERDR_CONFIG_PATH ?? join(homedir(), '.config', 'herdr', 'config.toml');
  if (!existsSync(configPath)) {
    return join(homedir(), '.herdr', 'worktrees');
  }

  const raw = parse(readFileSync(configPath, 'utf-8')) as RawHerdrConfig;
  return expandHome(raw.worktrees?.directory?.trim() || '~/.herdr/worktrees');
}

async function resolveRepoRoot(project: string): Promise<string> {
  const proc = Bun.spawn(['git', '-C', project, 'rev-parse', '--show-toplevel'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `failed to resolve git root for '${project}'`);
  }

  return stdout.trim();
}
