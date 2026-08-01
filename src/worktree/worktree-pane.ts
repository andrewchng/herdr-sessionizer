export {};

import { buildWorktreeArgvFromEnv, runWorktree } from "./worktree.ts";

runWorktree(buildWorktreeArgvFromEnv()).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
