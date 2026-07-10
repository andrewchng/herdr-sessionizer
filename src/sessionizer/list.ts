export {};

import { Herdr } from "../client/herdr.ts";
import { loadConfig } from "../config/config.ts";
import { createFrecency } from "../frecency/frecency.ts";
import { Workspaces } from "../ops/workspaces.ts";
import {
  buildRows,
  createRowDeps,
  isRowSource,
  type RowSource,
} from "./rows.ts";

interface ListArgs {
  source: RowSource;
  cwd: string;
}

function parseArgs(argv: readonly string[]): ListArgs {
  let source: RowSource = "default";
  let cwd =
    process.env.SESSIONIZER_CWD && process.env.SESSIONIZER_CWD.length > 0
      ? process.env.SESSIONIZER_CWD
      : process.cwd();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--source") {
      const value = argv[++i];
      if (value && isRowSource(value)) source = value;
    } else if (arg === "--cwd") {
      const value = argv[++i];
      if (value) cwd = value;
    }
  }

  return { source, cwd };
}

/**
 * Emit picker rows for a single source. Invoked by fzf `reload` bindings, so it
 * must never fail loudly: on any error it prints nothing and exits 0, leaving
 * fzf with an empty list rather than a broken reload.
 */
async function run(): Promise<void> {
  const { source, cwd } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const herdr = new Herdr();
  const workspaces = new Workspaces(herdr);
  const frecency = createFrecency();
  const deps = createRowDeps({
    listWorkspaces: () => workspaces.list(),
    frecency,
  });

  const rows = await buildRows(source, cwd, config, deps);
  if (rows.length > 0) {
    process.stdout.write(rows.join("\n") + "\n");
  }
}

run().catch((error: unknown) => {
  process.stderr.write(
    `[sessionizer] list failed: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(0);
});
