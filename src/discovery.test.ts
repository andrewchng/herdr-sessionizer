import { mkdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'bun:test';

import {
  expandHome,
  listProjects,
  normalizePath,
  sanitizeName,
  shellQuote,
  worktreeSlug,
} from './discovery.ts';

// ── sanitizeName ──────────────────────────────────────────────

describe('sanitizeName', () => {
  it('preserves alphanumeric, underscore, and hyphen characters', () => {
    expect(sanitizeName('hello_world-123')).toBe('hello_world-123');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeName('my branch')).toBe('my_branch');
  });

  it('replaces dots and slashes with underscores', () => {
    expect(sanitizeName('feature/feat.ui')).toBe('feature_feat_ui');
  });

  it('replaces special characters with underscores', () => {
    expect(sanitizeName('foo@bar!baz')).toBe('foo_bar_baz');
  });

  it('handles empty string', () => {
    expect(sanitizeName('')).toBe('');
  });
});

// ── normalizePath ──────────────────────────────────────────────

describe('normalizePath', () => {
  it('returns empty string for undefined', () => {
    expect(normalizePath(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizePath('')).toBe('');
  });

  it('strips trailing slashes', () => {
    expect(normalizePath('/home/user/projects/')).toBe('/home/user/projects');
  });

  it('strips multiple trailing slashes', () => {
    expect(normalizePath('/a/b///')).toBe('/a/b');
  });

  it('leaves paths without trailing slashes unchanged', () => {
    expect(normalizePath('/home/user/projects')).toBe('/home/user/projects');
  });

  it('handles root path with trailing slash', () => {
    expect(normalizePath('/')).toBe('');
  });
});

// ── expandHome ──────────────────────────────────────────────

describe('expandHome', () => {
  it('expands ~/ to the home directory', () => {
    const result = expandHome('~/Projects');
    expect(result).toStartWith('/');
    expect(result).toEndWith('/Projects');
    expect(result).not.toInclude('~');
  });

  it('leaves paths without ~ unchanged', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
  });

  it('leaves relative paths without ~ unchanged', () => {
    expect(expandHome('relative/path')).toBe('relative/path');
  });

  it('expands only leading ~/', () => {
    const result = expandHome('~/foo');
    expect(result).toStartWith('/');
    expect(result).toEndWith('/foo');
  });
});

// ── shellQuote ──────────────────────────────────────────────

describe('shellQuote', () => {
  it('wraps a plain string in single quotes', () => {
    expect(shellQuote('/home/project')).toBe("'/home/project'");
  });

  it('escapes embedded single quotes', () => {
    const result = shellQuote("it's a test");
    expect(result).toStartWith("'");
    expect(result).toEndWith("'");
    expect(result).toInclude("'\\''");
  });

  it('handles empty string', () => {
    expect(shellQuote('')).toBe("''");
  });

  it('handles string with spaces', () => {
    expect(shellQuote('/a/b /c')).toBe("'/a/b /c'");
  });
});

// ── worktreeSlug ──────────────────────────────────────────────

describe('worktreeSlug', () => {
  it('replaces non-alphanumeric sequences with hyphens', () => {
    expect(worktreeSlug('feature/my branch')).toBe('feature-my-branch');
  });

  it('lowercases the result', () => {
    expect(worktreeSlug('FEATURE/BRANCH')).toBe('feature-branch');
  });

  it('strips leading and trailing hyphens', () => {
    expect(worktreeSlug('!feature!')).toBe('feature');
  });

  it('handles already-clean branch names', () => {
    expect(worktreeSlug('main')).toBe('main');
  });

  it('collapses multiple consecutive separators', () => {
    expect(worktreeSlug('feature@@branch..name')).toBe('feature-branch-name');
  });

  it('handles empty string', () => {
    expect(worktreeSlug('')).toBe('');
  });
});

// ── listProjects ──────────────────────────────────────────────

// Helper: create a sandbox with known subdirectories and a file
function setupSandbox(): string {
  const sandbox = join(tmpdir(), 'herdr-sessionizer-test-discovery');
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  mkdirSync(join(sandbox, 'project-a'), { recursive: true });
  mkdirSync(join(sandbox, 'project-b'), { recursive: true });
  mkdirSync(join(sandbox, 'project-c'), { recursive: true });
  writeFileSync(join(sandbox, 'not-a-project.txt'), 'ignored');
  return sandbox;
}

describe('listProjects', () => {
  const sandbox = setupSandbox();

  it('lists immediate directories under the given roots', () => {
    const projects = listProjects([sandbox]);
    expect(projects).toHaveLength(3);
    expect(projects).toContain(join(sandbox, 'project-a'));
    expect(projects).toContain(join(sandbox, 'project-b'));
    expect(projects).toContain(join(sandbox, 'project-c'));
  });

  it('excludes files (non-directories)', () => {
    const projects = listProjects([sandbox]);
    for (const p of projects) {
      expect(p.endsWith('not-a-project.txt')).toBe(false);
    }
  });

  it('skips non-existent base paths silently', () => {
    const projects = listProjects([sandbox, '/nonexistent/path']);
    expect(projects).toHaveLength(3);
  });

  it('returns empty array when no bases exist', () => {
    expect(listProjects(['/nonexistent/path'])).toEqual([]);
  });

  it('returns results sorted alphabetically', () => {
    const projects = listProjects([sandbox]);
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i]! >= projects[i - 1]!).toBe(true);
    }
  });

  it('discovers projects from multiple base roots', () => {
    const extraRoot = join(tmpdir(), 'herdr-sessionizer-extra');
    rmSync(extraRoot, { recursive: true, force: true });
    mkdirSync(extraRoot, { recursive: true });
    mkdirSync(join(extraRoot, 'project-d'), { recursive: true });

    try {
      const projects = listProjects([sandbox, extraRoot]);
      expect(projects).toHaveLength(4);
      expect(projects).toContain(join(extraRoot, 'project-d'));
    } finally {
      rmSync(join(extraRoot, 'project-d'), { recursive: true, force: true });
      rmSync(extraRoot, { recursive: true, force: true });
    }
  });
});
