import type { PaneConfig } from '../config.ts';

import { shellQuote } from '../discovery.ts';

export interface LayoutCommandOptions {
  commandContext?: string;
  branch?: string;
}

export function buildPaneCommand(
  spec: PaneConfig,
  cwd: string,
  options?: LayoutCommandOptions,
): string {
  const quotedCwd = shellQuote(cwd);
  const resolved = resolvePaneCommand(spec, options);
  if (resolved) {
    return `cd ${quotedCwd} && ${interpolatePlaceholders(resolved, {
      branch: options?.branch,
      context: options?.commandContext,
    })}`;
  }

  return `cd ${quotedCwd}`;
}

export function resolvePaneCommand(spec: PaneConfig, options?: LayoutCommandOptions): string {
  if (options?.commandContext && spec.command_context) {
    return spec.command_context;
  }
  return spec.command;
}

export function interpolatePlaceholders(
  command: string,
  values: Record<string, string | undefined>,
): string {
  return command.replaceAll(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) return '';
    if (key === 'context') return shellQuote(value);
    return value;
  });
}
