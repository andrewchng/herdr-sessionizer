import { describe, expect, it, mock } from 'bun:test';

import { HerdrError } from './client/errors.ts';
import type { Workspace } from './client/types.ts';
import { runWorktree } from './worktree.ts';

describe('runWorktree', () => {
  it('reopens an existing worktree after create hits a duplicate-branch error without relayout', async () => {
    const duplicateBranchError = new HerdrError(
      ['worktree', 'create'],
      1,
      "fatal: a branch named 'feature/test-flow' already exists",
    );
    const existingWorkspace: Workspace = {
      workspace_id: 'ws-feature',
      cwd: '/repo',
      tab_count: 1,
      pane_count: 1,
      worktree: {
        checkout_path: '/repo/feature-test-flow',
      },
    };

    const open = mock(async (options: {
      workspaceId?: string;
      cwd?: string;
      branch?: string;
      path?: string;
      focus?: boolean;
    }) => {
      if (options.branch) {
        throw duplicateBranchError;
      }

      return {
        workspace: existingWorkspace,
        worktreePath: '/repo/feature-test-flow',
      };
    });
    const create = mock(async () => {
      throw duplicateBranchError;
    });
    const list = mock(async () => []);
    const focus = mock(async () => {});
    const resolveExisting = mock(async () => ({
      path: '/repo/feature-test-flow',
      source: 'git-branch' as const,
    }));
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const attachExistingBranch = mock(async () => '/repo/feature-test-flow');
    const log = mock(() => {});
    const error = mock(() => {});

    await runWorktree(['--project', '/repo', '--branch', 'feature/test-flow', '--context', 'copilot'], {
      worktrees: { open, create },
      workspaces: { list, get: mock(async () => existingWorkspace), focus },
      tabs: {},
      panes: {},
      config: {
        projects: { roots: ['/repo'] },
        layout: { placement: 'overlay', focus: 'terminal' },
        tabs: [],
      },
      resolver: { resolveExisting },
      createLayout,
      pickProject: mock(async () => []),
      promptBranch: mock(async () => 'feature/test-flow'),
      attachExistingBranch,
      logger: { log, error },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(list).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[0]?.[0]).toEqual({
      workspaceId: undefined,
      cwd: '/repo',
      branch: 'feature/test-flow',
      focus: true,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: '/repo',
      branch: 'feature/test-flow',
      label: 'feature_test-flow',
      focus: false,
    });
    expect(resolveExisting).toHaveBeenCalledWith({
      project: '/repo',
      branch: 'feature/test-flow',
      error: duplicateBranchError,
    });
    expect(open.mock.calls[1]?.[0]).toEqual({
      workspaceId: undefined,
      cwd: '/repo',
      path: '/repo/feature-test-flow',
      focus: true,
    });
    expect(createLayout).not.toHaveBeenCalled();
    expect(attachExistingBranch).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("✓ opened existing worktree path '/repo/feature-test-flow' for 'feature/test-flow'");
  });

  it('attaches an existing branch as a new worktree when no existing checkout can be resolved', async () => {
    const duplicateBranchError = new HerdrError(
      ['worktree', 'create'],
      1,
      "fatal: a branch named 'feature/test-flow' already exists",
    );
    const createdWorkspace: Workspace = {
      workspace_id: 'ws-feature',
      cwd: '/repo',
      tab_count: 1,
      pane_count: 1,
      worktree: {
        checkout_path: '/Users/mac/.herdr/worktrees/repo/feature-test-flow',
      },
    };

    const open = mock(async (options: {
      workspaceId?: string;
      cwd?: string;
      branch?: string;
      path?: string;
      label?: string;
      focus?: boolean;
    }) => {
      if (options.branch) {
        throw duplicateBranchError;
      }

      return {
        workspace: createdWorkspace,
        worktreePath: '/Users/mac/.herdr/worktrees/repo/feature-test-flow',
      };
    });
    const create = mock(async () => {
      throw duplicateBranchError;
    });
    const resolveExisting = mock(async () => undefined);
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});
    const attachExistingBranch = mock(async () => '/Users/mac/.herdr/worktrees/repo/feature-test-flow');
    const log = mock(() => {});
    const error = mock(() => {});

    await runWorktree(['--project', '/repo', '--branch', 'feature/test-flow'], {
      worktrees: { open, create },
      workspaces: {
        list: mock(async () => []),
        get: mock(async () => createdWorkspace),
        focus,
      },
      tabs: {},
      panes: {},
      config: {
        projects: { roots: ['/repo'] },
        layout: { placement: 'overlay', focus: 'terminal' },
        tabs: [],
      },
      resolver: { resolveExisting },
      createLayout,
      pickProject: mock(async () => []),
      promptBranch: mock(async () => 'feature/test-flow'),
      attachExistingBranch,
      logger: { log, error },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(resolveExisting).toHaveBeenCalledWith({
      project: '/repo',
      branch: 'feature/test-flow',
      error: duplicateBranchError,
    });
    expect(attachExistingBranch).toHaveBeenCalledWith('/repo', 'feature/test-flow');
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]?.[0]).toEqual({
      workspaceId: undefined,
      cwd: '/repo',
      path: '/Users/mac/.herdr/worktrees/repo/feature-test-flow',
      label: 'feature_test-flow',
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledWith(
      createdWorkspace,
      '/Users/mac/.herdr/worktrees/repo/feature-test-flow',
      {
        projects: { roots: ['/repo'] },
        layout: { placement: 'overlay', focus: 'terminal' },
        tabs: [],
      },
      {},
      {},
      {
        commandContext: undefined,
        branch: 'feature/test-flow',
      },
    );
    expect(focus).toHaveBeenCalledWith('ws-feature');
    expect(log).toHaveBeenCalledWith("✓ worktree 'feature/test-flow' created and focused (ws-feature)");
  });

  it('rethrows non-duplicate create errors when no existing worktree can be resolved', async () => {
    const createError = new HerdrError(['worktree', 'create'], 1, 'fatal: repository is bare');

    const open = mock(async () => {
      throw createError;
    });
    const create = mock(async () => {
      throw createError;
    });
    const resolveExisting = mock(async () => undefined);

    await expect(
      runWorktree(['--project', '/repo', '--branch', 'feature/test-flow'], {
        worktrees: { open, create },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => undefined),
          focus: mock(async () => {}),
        },
        tabs: {},
        panes: {},
        config: {
          projects: { roots: ['/repo'] },
          layout: { placement: 'overlay', focus: 'terminal' },
          tabs: [],
        },
        resolver: { resolveExisting },
        createLayout: mock(async (workspace: Workspace) => workspace),
        pickProject: mock(async () => []),
        promptBranch: mock(async () => 'feature/test-flow'),
        attachExistingBranch: mock(async () => '/unused'),
        logger: { log: mock(() => {}), error: mock(() => {}) },
        exit: (code) => {
          throw new Error(`unexpected exit ${code}`);
        },
      }),
    ).rejects.toBe(createError);
  });
});
