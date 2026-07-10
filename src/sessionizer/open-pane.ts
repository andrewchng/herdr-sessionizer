export {};

import { Herdr } from "../client/herdr.ts";
import { loadConfig } from "../config/config.ts";
import { Workspaces } from "../ops/workspaces.ts";
import { workspacePath } from "./candidates.ts";

/**
 * Resolve the directory the picker was launched from so the "current" and
 * "find" sources have a meaningful base. Prefers the focused workspace's cwd
 * (via HERDR_WORKSPACE_ID), falling back to the process cwd.
 */
async function resolveLaunchCwd(herdr: Herdr): Promise<string> {
  const workspaceId = process.env.HERDR_WORKSPACE_ID;
  if (workspaceId) {
    try {
      const workspace = await new Workspaces(herdr).get(workspaceId);
      const path = workspace ? workspacePath(workspace) : "";
      if (path) return path;
    } catch {
      // Fall through to process.cwd() below.
    }
  }
  return process.cwd();
}

async function run(): Promise<void> {
  const pluginId = process.env.HERDR_PLUGIN_ID;
  if (!pluginId) {
    throw new Error(
      "HERDR_PLUGIN_ID is required to open the sessionizer pane."
    );
  }

  const herdr = new Herdr();
  const config = loadConfig();
  const placement =
    process.env.SESSIONIZER_PANE_PLACEMENT ?? config.layout.placement;
  const cwd = await resolveLaunchCwd(herdr);
  const args = [
    "plugin",
    "pane",
    "open",
    "--plugin",
    pluginId,
    "--entrypoint",
    "sessionizer",
    "--placement",
    placement,
    "--env",
    `SESSIONIZER_CWD=${cwd}`,
    "--focus",
  ];

  if (placement !== "overlay") {
    if (process.env.HERDR_PANE_ID) {
      args.push("--target-pane", process.env.HERDR_PANE_ID);
    } else if (process.env.HERDR_WORKSPACE_ID) {
      args.push("--workspace", process.env.HERDR_WORKSPACE_ID);
    }
  }

  await herdr.run(args);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
