import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import { parse } from 'smol-toml';

interface ScriptsConfig {
  agents?: { default?: string };
}

export interface SessionizerConfig {
  agent: string;
}

export function loadConfig(): SessionizerConfig {
  const legacyBasePath = process.env.SCRIPTS_TOML ?? `${homedir()}/.config/herdr/scripts.toml`;
  const legacyLocalPath = process.env.SCRIPTS_LOCAL_TOML ?? join(dirname(legacyBasePath), 'scripts.local.toml');
  const pluginConfigPath = process.env.HERDR_PLUGIN_CONFIG_DIR
    ? join(process.env.HERDR_PLUGIN_CONFIG_DIR, 'config.toml')
    : undefined;

  const legacyBase = loadRaw(legacyBasePath);
  const legacyLocal = loadRaw(legacyLocalPath);
  const pluginConfig = pluginConfigPath ? loadRaw(pluginConfigPath) : undefined;

  return {
    agent:
      process.env.AI_AGENT ??
      pluginConfig?.agents?.default ??
      legacyLocal?.agents?.default ??
      legacyBase?.agents?.default ??
      'opencode',
  };
}

function loadRaw(path: string): ScriptsConfig | undefined {
  if (!existsSync(path)) return undefined;
  return parse(readFileSync(path, 'utf-8')) as ScriptsConfig;
}
