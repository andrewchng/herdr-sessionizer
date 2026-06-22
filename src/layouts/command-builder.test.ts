import { describe, expect, it } from 'bun:test';

import { buildPaneCommand, interpolatePlaceholders, resolvePaneCommand } from './command-builder.ts';

describe('buildPaneCommand', () => {
  it('builds a plain cwd command when the pane has no command', () => {
    expect(buildPaneCommand({ title: 'shell', command: '' }, '/tmp/my repo')).toBe("cd '/tmp/my repo'");
  });

  it('runs the raw command override when the pane accepts it', () => {
    expect(
      buildPaneCommand(
        { title: 'assistant', command: 'kiro-cli', accept_command_override: true },
        '/tmp/my repo',
        { commandOverride: 'kiro-cli chat "review this change"' },
      ),
    ).toBe(`cd '/tmp/my repo' && kiro-cli chat "review this change"`);
  });

  it('falls back to command when no override is provided', () => {
    expect(
      buildPaneCommand({ title: 'assistant', command: 'kiro-cli', accept_command_override: true }, '/tmp/my repo'),
    ).toBe("cd '/tmp/my repo' && kiro-cli");
  });

  it('falls back to command when the pane does not accept override', () => {
    expect(
      buildPaneCommand({ title: 'editor', command: 'nvim' }, '/tmp/my repo', { commandOverride: 'echo hi' }),
    ).toBe("cd '/tmp/my repo' && nvim");
  });

  it('still interpolates {branch} in normal pane commands', () => {
    expect(
      buildPaneCommand(
        {
          title: 'server',
          command: 'pnpm dev --branch {branch}',
        },
        '/tmp/my repo',
        { branch: 'feat/test' },
      ),
    ).toBe("cd '/tmp/my repo' && pnpm dev --branch feat/test");
  });

  it('uses the raw override exactly as provided', () => {
    expect(
      buildPaneCommand(
        { title: 'assistant', command: 'kiro-cli', accept_command_override: true },
        '/tmp/my repo',
        { commandOverride: 'kiro-cli chat "$PROMPT" && echo done' },
      ),
    ).toBe(`cd '/tmp/my repo' && kiro-cli chat "$PROMPT" && echo done`);
  });
});

describe('resolvePaneCommand', () => {
  it('uses command override when the pane accepts it', () => {
    expect(
      resolvePaneCommand({ title: 'assistant', command: 'kiro-cli', accept_command_override: true }, { commandOverride: 'echo hi' }),
    ).toBe('echo hi');
  });

  it('falls back to command when override is missing', () => {
    expect(resolvePaneCommand({ title: 'assistant', command: 'kiro-cli', accept_command_override: true })).toBe('kiro-cli');
  });

  it('falls back to command when pane does not accept override', () => {
    expect(resolvePaneCommand({ title: 'editor', command: 'nvim' }, { commandOverride: 'echo hi' })).toBe('nvim');
  });

  it('falls back to command when override is an empty string', () => {
    expect(resolvePaneCommand({ title: 'assistant', command: 'kiro-cli', accept_command_override: true }, { commandOverride: '' })).toBe(
      'kiro-cli',
    );
  });
});

describe('interpolatePlaceholders', () => {
  it('leaves {branch} raw (no shell quoting)', () => {
    expect(interpolatePlaceholders('echo {branch}', { branch: 'feat/test' })).toBe('echo feat/test');
  });

  it('preserves whitespace around placeholders (matches existing {branch} behavior)', () => {
    expect(interpolatePlaceholders('echo   {branch}   done', { branch: 'feat/test' })).toBe(
      'echo   feat/test   done',
    );
  });

  it('replaces missing placeholders with the empty string', () => {
    expect(interpolatePlaceholders('echo {branch}!', {})).toBe('echo !');
  });

  it('interpolates multiple placeholders of different kinds', () => {
    expect(interpolatePlaceholders('echo {branch} {missing}', { branch: 'feat/x' })).toBe('echo feat/x ');
  });
});
