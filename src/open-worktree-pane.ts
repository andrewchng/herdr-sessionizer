export {};

import { Herdr } from './client/herdr.ts';
import { loadConfig } from './config.ts';

export async function openWorktreePane(extraEnv: Record<string, string> = {}): Promise<void> {
  const pluginId = process.env.HERDR_PLUGIN_ID;
  if (!pluginId) {
    throw new Error('HERDR_PLUGIN_ID is required to open the worktree pane.');
  }

  const herdr = new Herdr();
  const config = loadConfig();
  const args = [
    'plugin',
    'pane',
    'open',
    '--plugin',
    pluginId,
    '--entrypoint',
    'worktree',
    '--placement',
    config.layout.placement,
    '--focus',
  ];

  for (const [key, value] of Object.entries(extraEnv)) {
    args.push('--env', `${key}=${value}`);
  }

  await herdr.run(args);
}

if (import.meta.main) {
  openWorktreePane().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
