import { describe, expect, it, mock } from 'bun:test';

import { HerdrError } from './client/errors.ts';
import type { Workspace } from './client/types.ts';
import { runWorktree } from './worktree.ts';

describe('runWorktree', () => {
  it('reopens an existing worktree after create hits a duplicate-branch error and bootstraps layout', async () => {
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
    const get = mock(async () => existingWorkspace);
    const focus = mock(async () => {});
    const resolveExisting = mock(async () => ({
      path: '/repo/feature-test-flow',
      source: 'git-branch' as const,
    }));
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const log = mock(() => {});
    const error = mock(() => {});

    await runWorktree(['--project', '/repo', '--branch', 'feature/test-flow', '--context', 'copilot'], {
      worktrees: { open, create },
      workspaces: { list, get, focus },
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
    expect(createLayout).toHaveBeenCalledWith(
      existingWorkspace,
      '/repo/feature-test-flow',
      {
        projects: { roots: ['/repo'] },
        layout: { placement: 'overlay', focus: 'terminal' },
        tabs: [],
      },
      {},
      {},
      {
        commandContext: 'copilot',
        branch: 'feature/test-flow',
      },
    );
    expect(focus).toHaveBeenCalledWith('ws-feature');
    expect(log).toHaveBeenCalledWith("✓ bootstrapped layout for 'feature/test-flow'");
  });

  it('rethrows the duplicate-branch herdr error when no existing worktree can be resolved', async () => {
    const duplicateBranchError = new HerdrError(
      ['worktree', 'create'],
      1,
      "fatal: a branch named 'feature/test-flow' already exists",
    );

    const open = mock(async () => {
      throw duplicateBranchError;
    });
    const create = mock(async () => {
      throw duplicateBranchError;
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
        logger: { log: mock(() => {}), error: mock(() => {}) },
        exit: (code) => {
          throw new Error(`unexpected exit ${code}`);
        },
      }),
    ).rejects.toBe(duplicateBranchError);

    expect(resolveExisting).toHaveBeenCalledWith({
      project: '/repo',
      branch: 'feature/test-flow',
      error: duplicateBranchError,
    });
  });
});
