import { describe, expect, it, mock } from 'bun:test';

import { attachExistingBranchWorktree } from './worktree-branch-fallback.ts';

describe('attachExistingBranchWorktree', () => {
  it('returns the target path when git worktree add succeeds', async () => {
    const runGit = mock(async (_cwd: string, args: string[]) => {
      if (args[0] === 'rev-parse') {
        return { stdout: '/repo\n', stderr: '', exitCode: 0 };
      }

      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const path = await attachExistingBranchWorktree('/repo', 'feature/test-flow', {
      runGit,
      pathExists: () => false,
    });

    expect(path).toBe('/Users/mac/.herdr/worktrees/repo/feature-test-flow');
  });

  it('reuses an existing target path when it is already the requested worktree checkout', async () => {
    const runGit = mock(async (cwd: string, args: string[]) => {
      if (cwd === '/repo' && args[0] === 'rev-parse') {
        return { stdout: '/repo\n', stderr: '', exitCode: 0 };
      }
      if (cwd === '/repo' && args[0] === 'worktree') {
        return {
          stdout: '',
          stderr: "Preparing worktree (checking out 'feature/test-flow')\nfatal: '/Users/mac/.herdr/worktrees/repo/feature-test-flow' already exists",
          exitCode: 128,
        };
      }
      if (cwd === '/Users/mac/.herdr/worktrees/repo/feature-test-flow' && args.join(' ') === 'rev-parse --show-toplevel') {
        return { stdout: '/repo\n', stderr: '', exitCode: 0 };
      }
      if (cwd === '/Users/mac/.herdr/worktrees/repo/feature-test-flow' && args.join(' ') === 'branch --show-current') {
        return { stdout: 'feature/test-flow\n', stderr: '', exitCode: 0 };
      }

      throw new Error(`unexpected git call: ${cwd} ${args.join(' ')}`);
    });

    const path = await attachExistingBranchWorktree('/repo', 'feature/test-flow', {
      runGit,
      pathExists: () => true,
    });

    expect(path).toBe('/Users/mac/.herdr/worktrees/repo/feature-test-flow');
  });

  it('throws a clear stale-path error when the target path exists but is not a git worktree', async () => {
    const runGit = mock(async (cwd: string, args: string[]) => {
      if (cwd === '/repo' && args[0] === 'rev-parse') {
        return { stdout: '/repo\n', stderr: '', exitCode: 0 };
      }
      if (cwd === '/repo' && args[0] === 'worktree') {
        return {
          stdout: '',
          stderr: "Preparing worktree (checking out 'feature/test-flow')\nfatal: '/Users/mac/.herdr/worktrees/repo/feature-test-flow' already exists",
          exitCode: 128,
        };
      }
      if (cwd === '/Users/mac/.herdr/worktrees/repo/feature-test-flow' && args.join(' ') === 'rev-parse --show-toplevel') {
        return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 };
      }

      throw new Error(`unexpected git call: ${cwd} ${args.join(' ')}`);
    });

    await expect(
      attachExistingBranchWorktree('/repo', 'feature/test-flow', {
        runGit,
        pathExists: () => true,
      }),
    ).rejects.toThrow(
      "target worktree path '/Users/mac/.herdr/worktrees/repo/feature-test-flow' already exists but is not a reusable checkout for branch 'feature/test-flow'; remove or relocate that directory and retry",
    );
  });
});
