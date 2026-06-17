import { basename } from 'node:path';

import { HerdrError } from './client/errors.ts';
import { worktreeSlug } from './discovery.ts';

export interface ExistingWorktreeResolution {
  path: string;
  source: 'error' | 'git-branch' | 'git-slug';
}

export interface ResolveExistingWorktreeOptions {
  project: string;
  branch: string;
  error?: HerdrError;
}

export type ListWorktreesPorcelain = (project: string) => Promise<string | undefined>;

export class WorktreeResolver {
  constructor(private readonly listWorktreesPorcelain: ListWorktreesPorcelain = defaultListWorktreesPorcelain) {}

  async resolveExisting(
    options: ResolveExistingWorktreeOptions,
  ): Promise<ExistingWorktreeResolution | undefined> {
    const errorPath = existingWorktreePathFromError(options.error);
    if (errorPath) {
      return { path: errorPath, source: 'error' };
    }

    if (!shouldInspectGit(options.error)) {
      return undefined;
    }

    const porcelain = await this.listWorktreesPorcelain(options.project);
    if (!porcelain) {
      return undefined;
    }

    const branchPath = existingWorktreePathFromPorcelainByBranch(porcelain, options.branch);
    if (branchPath) {
      return { path: branchPath, source: 'git-branch' };
    }

    const slugPath = existingWorktreePathFromPorcelainBySlug(porcelain, options.branch);
    if (slugPath) {
      return { path: slugPath, source: 'git-slug' };
    }

    return undefined;
  }
}

export function existingWorktreePathFromError(error: HerdrError | undefined): string | undefined {
  const match = error?.stderr.match(/already used by worktree at '([^']+)'/);
  return match?.[1];
}

export function existingWorktreePathFromPorcelainByBranch(
  porcelain: string,
  branch: string,
): string | undefined {
  const target = `refs/heads/${branch}`;
  let currentPath: string | undefined;

  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      currentPath = line.slice('worktree '.length).trim();
      continue;
    }

    if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim();
      if (ref === target) {
        return currentPath;
      }
    }
  }

  return undefined;
}

export function existingWorktreePathFromPorcelainBySlug(
  porcelain: string,
  branch: string,
): string | undefined {
  const target = worktreeSlug(branch);

  for (const line of porcelain.split('\n')) {
    if (!line.startsWith('worktree ')) {
      continue;
    }

    const path = line.slice('worktree '.length).trim();
    if (worktreeSlug(basename(path)) === target) {
      return path;
    }
  }

  return undefined;
}

function shouldInspectGit(error: HerdrError | undefined): boolean {
  return !error || error.stderr.includes('a branch named');
}

async function defaultListWorktreesPorcelain(project: string): Promise<string | undefined> {
  const proc = Bun.spawn(['git', '-C', project, 'worktree', 'list', '--porcelain'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    return undefined;
  }

  return stdout;
}
