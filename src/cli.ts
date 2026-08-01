export {};

import { openSessionizerPane } from "./sessionizer/open-pane.ts";
import { runSessionizer } from "./sessionizer/sessionizer.ts";
import { openWorktreePane } from "./worktree/open-worktree-pane.ts";
import { buildWorktreeArgvFromEnv, runWorktree } from "./worktree/worktree.ts";

export const MODES = [
  "open",
  "sessionizer",
  "worktree-open",
  "worktree",
] as const;

export type Mode = (typeof MODES)[number];

export type ParseResult =
  | { ok: true; kind: "help" }
  | { ok: true; kind: "run"; mode: Mode; args: string[] }
  | { ok: false; error: string };

export function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

export function usage(): string {
  return `Usage:
  sessionizer <mode> [args...]

Modes:
  open            Open the Sessionizer pane (action launcher)
  sessionizer     Run the Sessionizer flow (pane body)
  worktree-open   Open the Worktree pane (action launcher)
  worktree        Run the Worktree flow (pane body)

Examples:
  sessionizer open
  sessionizer sessionizer
  sessionizer worktree-open
  sessionizer worktree --project ~/Projects/my-repo --branch feat/x
`;
}

export function parseArgs(argv: readonly string[]): ParseResult {
  const first = argv[0];
  if (first === undefined || first === "--help" || first === "-h") {
    return { ok: true, kind: "help" };
  }

  if (!isMode(first)) {
    return { ok: false, error: `Unknown mode: ${first}` };
  }

  return { ok: true, kind: "run", mode: first, args: argv.slice(1) };
}

export async function dispatch(
  mode: Mode,
  args: readonly string[] = []
): Promise<void> {
  switch (mode) {
    case "open":
      await openSessionizerPane();
      return;
    case "sessionizer":
      await runSessionizer();
      return;
    case "worktree-open":
      await openWorktreePane();
      return;
    case "worktree":
      await runWorktree(
        args.length > 0 ? [...args] : buildWorktreeArgvFromEnv()
      );
      return;
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  const parsed = parseArgs(argv);

  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(usage());
    return 1;
  }

  if (parsed.kind === "help") {
    console.log(usage());
    return 0;
  }

  await dispatch(parsed.mode, parsed.args);
  return 0;
}

if (import.meta.main) {
  main()
    .then((code) => {
      if (code !== 0) {
        process.exit(code);
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
