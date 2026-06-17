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
  const rawCommand = spec.command;
  if (rawCommand) {
    return `cd ${quotedCwd} && ${interpolateCommand(applyCommandContext(rawCommand, options?.commandContext), options?.branch)}`;
  }

  return `cd ${quotedCwd}`;
}

export function applyCommandContext(command: string, context?: string): string {
  if (!context) return command;
  const trimmed = command.trim();
  if (trimmed === 'kiro-cli') {
    return `kiro-cli chat ${shellQuote(context)}`;
  }
  if (trimmed.startsWith('kiro-cli chat ')) {
    return `${trimmed} ${shellQuote(context)}`;
  }
  if (trimmed === 'kiro-cli chat') {
    return `kiro-cli chat ${shellQuote(context)}`;
  }
  return command;
}

export function interpolateCommand(command: string, branch?: string): string {
  return branch ? command.replaceAll('{branch}', branch) : command;
}
