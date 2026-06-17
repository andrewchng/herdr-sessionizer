import { describe, expect, it } from 'bun:test';

import { applyCommandContext, buildPaneCommand, interpolateCommand } from './command-builder.ts';

describe('buildPaneCommand', () => {
  it('builds a plain cwd command when the pane has no command', () => {
    expect(buildPaneCommand({ title: 'shell', command: '' }, '/tmp/my repo')).toBe("cd '/tmp/my repo'");
  });

  it('applies command context and branch interpolation', () => {
    expect(
      buildPaneCommand(
        { title: 'assistant', command: 'kiro-cli chat --topic {branch}' },
        '/tmp/my repo',
        { commandContext: 'review this change', branch: 'feat/test' },
      ),
    ).toBe("cd '/tmp/my repo' && kiro-cli chat --topic feat/test 'review this change'");
  });
});

describe('applyCommandContext', () => {
  it('converts kiro-cli into a chat command when context is present', () => {
    expect(applyCommandContext('kiro-cli', 'help me')).toBe("kiro-cli chat 'help me'");
  });

  it('leaves unrelated commands unchanged', () => {
    expect(applyCommandContext('npm run dev', 'help me')).toBe('npm run dev');
  });
});

describe('interpolateCommand', () => {
  it('replaces all branch placeholders', () => {
    expect(interpolateCommand('echo {branch} && git switch {branch}', 'feat/test')).toBe(
      'echo feat/test && git switch feat/test',
    );
  });
});
