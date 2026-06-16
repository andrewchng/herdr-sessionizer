export {};

import { openWorktreePane } from './open-worktree-pane.ts';

openWorktreePane(buildEnv()).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.WORKTREE_PROJECT) {
    env.WORKTREE_PROJECT = process.env.WORKTREE_PROJECT;
  }
  if (process.env.WORKTREE_BRANCH) {
    env.WORKTREE_BRANCH = process.env.WORKTREE_BRANCH;
  }
  if (process.env.WORKTREE_CONTEXT) {
    env.WORKTREE_CONTEXT = process.env.WORKTREE_CONTEXT;
  }
  return env;
}
