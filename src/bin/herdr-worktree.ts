#!/usr/bin/env bun

import { runWorktree } from '../worktree.ts';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`Usage:
  herdr-worktree
  herdr-worktree --project <path> --branch <name> [--command <raw-shell-command>]

Examples:
  herdr-worktree
  herdr-worktree --project ~/Projects/my-repo --branch feat/new-flow
  herdr-worktree --project ~/Projects/my-repo --branch feat/new-flow --command 'kiro-cli chat "Fix the failing form validation and summarize changes"'
`);
  process.exit(0);
}

runWorktree(argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
