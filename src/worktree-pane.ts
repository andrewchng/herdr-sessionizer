export {};

import { runWorktree } from './worktree.ts';

runWorktree(buildArgvFromEnv()).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function buildArgvFromEnv(): string[] {
  const argv: string[] = [];
  if (process.env.WORKTREE_PROJECT) {
    argv.push('--project', process.env.WORKTREE_PROJECT);
  }
  if (process.env.WORKTREE_BRANCH) {
    argv.push('--branch', process.env.WORKTREE_BRANCH);
  }
  if (process.env.WORKTREE_CONTEXT) {
    argv.push('--context', process.env.WORKTREE_CONTEXT);
  }
  return argv;
}
