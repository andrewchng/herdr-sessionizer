import { describe, expect, it } from 'bun:test';

import { buildPaneCommand, interpolatePlaceholders, resolvePaneCommand } from './command-builder.ts';

describe('buildPaneCommand', () => {
  it('builds a plain cwd command when the pane has no command', () => {
    expect(buildPaneCommand({ title: 'shell', command: '' }, '/tmp/my repo')).toBe("cd '/tmp/my repo'");
  });

  it('runs command_context when both spec and context are present', () => {
    expect(
      buildPaneCommand(
        { title: 'assistant', command: 'kiro-cli', command_context: 'kiro-cli chat {context}' },
        '/tmp/my repo',
        { commandContext: 'review this change' },
      ),
    ).toBe("cd '/tmp/my repo' && kiro-cli chat 'review this change'");
  });

  it('falls back to command when context is missing', () => {
    expect(
      buildPaneCommand(
        { title: 'assistant', command: 'kiro-cli', command_context: 'kiro-cli chat {context}' },
        '/tmp/my repo',
      ),
    ).toBe("cd '/tmp/my repo' && kiro-cli");
  });

  it('falls back to command when command_context is unset on the spec', () => {
    expect(
      buildPaneCommand({ title: 'editor', command: 'nvim' }, '/tmp/my repo', { commandContext: 'irrelevant' }),
    ).toBe("cd '/tmp/my repo' && nvim");
  });

  it('interpolates both {branch} and {context} together', () => {
    expect(
      buildPaneCommand(
        {
          title: 'assistant',
          command: 'kiro-cli',
          command_context: 'kiro-cli chat --topic {branch} {context}',
        },
        '/tmp/my repo',
        { commandContext: 'review this', branch: 'feat/test' },
      ),
    ).toBe("cd '/tmp/my repo' && kiro-cli chat --topic feat/test 'review this'");
  });

  it('drops the context silently when the spec has no command_context', () => {
    expect(
      buildPaneCommand({ title: 'tool', command: 'pi' }, '/tmp/my repo', { commandContext: 'fix bug' }),
    ).toBe("cd '/tmp/my repo' && pi");
  });
});

describe('resolvePaneCommand', () => {
  it('uses command_context when context is present', () => {
    expect(
      resolvePaneCommand(
        { title: 'assistant', command: 'kiro-cli', command_context: 'kiro-cli chat {context}' },
        { commandContext: 'fix bug' },
      ),
    ).toBe('kiro-cli chat {context}');
  });

  it('falls back to command when context is missing', () => {
    expect(
      resolvePaneCommand({
        title: 'assistant',
        command: 'kiro-cli',
        command_context: 'kiro-cli chat {context}',
      }),
    ).toBe('kiro-cli');
  });

  it('falls back to command when command_context is unset on the spec', () => {
    expect(
      resolvePaneCommand({ title: 'editor', command: 'nvim' }, { commandContext: 'fix bug' }),
    ).toBe('nvim');
  });

  it('falls back to command when context is an empty string', () => {
    expect(
      resolvePaneCommand(
        { title: 'assistant', command: 'kiro-cli', command_context: 'kiro-cli chat {context}' },
        { commandContext: '' },
      ),
    ).toBe('kiro-cli');
  });
});

describe('interpolatePlaceholders', () => {
  it('shell-quotes {context} values', () => {
    expect(interpolatePlaceholders('kiro-cli chat {context}', { context: 'fix the bug & restart' })).toBe(
      "kiro-cli chat 'fix the bug & restart'",
    );
  });

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
    expect(
      interpolatePlaceholders('kiro-cli chat --topic {branch} {context}', {
        branch: 'feat/x',
        context: 'review this',
      }),
    ).toBe("kiro-cli chat --topic feat/x 'review this'");
  });
});
