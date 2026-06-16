export {};

import { Herdr } from './client/herdr.ts';

async function run(): Promise<void> {
  const pluginId = process.env.HERDR_PLUGIN_ID;
  if (!pluginId) {
    throw new Error('HERDR_PLUGIN_ID is required to open the sessionizer pane.');
  }

  const herdr = new Herdr();
  const placement = process.env.SESSIONIZER_PANE_PLACEMENT ?? 'overlay';
  const args = [
    'plugin',
    'pane',
    'open',
    '--plugin',
    pluginId,
    '--entrypoint',
    'sessionizer',
    '--placement',
    placement,
    '--focus',
  ];

  if (placement !== 'overlay') {
    if (process.env.HERDR_PANE_ID) {
      args.push('--target-pane', process.env.HERDR_PANE_ID);
    } else if (process.env.HERDR_WORKSPACE_ID) {
      args.push('--workspace', process.env.HERDR_WORKSPACE_ID);
    }
  }

  await herdr.run(args);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
