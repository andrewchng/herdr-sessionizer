export {};

import { Herdr } from "../client/herdr.ts";
import { loadConfig } from "../config/config.ts";

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
    process.env.SESSIONIZER_PANE_PLACEMENT ?? config.ui.placement;
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
    "--focus",
  ];

  if (placement === "popup") {
    const width = process.env.SESSIONIZER_PANE_WIDTH ?? config.ui.width;
    const height = process.env.SESSIONIZER_PANE_HEIGHT ?? config.ui.height;
    if (width !== undefined) args.push("--width", String(width));
    if (height !== undefined) args.push("--height", String(height));
  } else if (placement !== "overlay") {
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
