import { describe, expect, it, mock } from 'bun:test';

import type { SessionizerConfig } from './config.ts';
import type { Workspace } from './client/types.ts';
import type { LayoutPanes, LayoutTabs } from './layouts/project.ts';
import { runSessionizer } from './sessionizer.ts';

function testConfig(): SessionizerConfig {
  return {
    projects: { roots: ['/projects'] },
    layout: { placement: 'overlay', focus: 'assistant' },
    tabs: [],
  };
}

function testWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    workspace_id: 'ws1',
    label: 'fieldnotes',
    pane_count: 3,
    tab_count: 2,
    ...overrides,
  };
}

function testTabs(): LayoutTabs {
  return {
    create: mock(async () => ({ tab_id: 'ws1:t1', workspace_id: 'ws1' })),
    rename: mock(async () => {}),
    focus: mock(async () => {}),
  };
}

function testPanes(): LayoutPanes {
  return {
    split: mock(async () => ({ pane_id: 'ws1-2', terminal_id: 'term-2', workspace_id: 'ws1', tab_id: 'ws1:t1' })),
    run: mock(async () => {}),
    rename: mock(async () => {}),
  };
}

describe('runSessionizer', () => {
  it('focuses an existing workspace when selected from the first picker', async () => {
    const focus = mock(async () => {});
    const pickRows = mock(async (rows: readonly string[]) => [rows[0]!]);

    await runSessionizer({
      workspaces: {
        list: mock(async () => [testWorkspace()]),
        create: mock(async (_options) => testWorkspace()),
        focus,
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pickRows,
      listProjects: mock(() => ['/projects/fieldnotes']),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(focus).toHaveBeenCalledWith('ws1');
    expect(pickRows).toHaveBeenCalledTimes(1);
  });

  it('falls through to the project picker when the existing-session picker is dismissed', async () => {
    const tabs = testTabs();
    const panes = testPanes();
    const create = mock(async ({ cwd, label }: { cwd: string; label: string }) =>
      testWorkspace({ cwd, label, workspace_id: 'ws-project' }),
    );
    const focus = mock(async () => {});
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const pickRows = mock(async (_rows: readonly string[], options?: { prompt?: string }) => {
      if (options?.prompt === 'Switch session (Esc for new): ') {
        return null;
      }

      return ['/projects/fieldnotes'];
    });

    await runSessionizer({
      workspaces: {
        list: mock(async () => [testWorkspace()]),
        create,
        focus,
      },
      tabs,
      panes,
      config: testConfig(),
      pickRows,
      listProjects: mock(() => ['/projects/fieldnotes']),
      createLayout,
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(pickRows).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      cwd: '/projects/fieldnotes',
      label: 'fieldnotes',
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledWith(
      testWorkspace({ cwd: '/projects/fieldnotes', label: 'fieldnotes', workspace_id: 'ws-project' }),
      '/projects/fieldnotes',
      testConfig(),
      tabs,
      panes,
    );
    expect(focus).toHaveBeenCalledWith('ws-project');
  });

  it('exits with an error when no projects are found', async () => {
    const error = mock(() => {});

    await expect(
      runSessionizer({
        workspaces: {
          list: mock(async () => []),
          create: mock(async (_options) => testWorkspace()),
          focus: mock(async () => {}),
        },
        tabs: testTabs(),
        panes: testPanes(),
        config: testConfig(),
        pickRows: mock(async () => null),
        listProjects: mock(() => []),
        createLayout: mock(async (workspace: Workspace) => workspace),
        logger: { log: mock(() => {}), error },
        exit: (code) => {
          throw new Error(`exit ${code}`);
        },
      }),
    ).rejects.toThrow('exit 1');

    expect(error).toHaveBeenCalledWith('No projects found in configured directories.');
  });

  it('creates, lays out, and focuses a new workspace from the project picker', async () => {
    const tabs = testTabs();
    const panes = testPanes();
    const workspace = testWorkspace({ cwd: '/projects/herdr-sessionizer', label: 'herdr-sessionizer', workspace_id: 'ws-new' });
    const create = mock(async () => workspace);
    const createLayout = mock(async (createdWorkspace: Workspace) => createdWorkspace);
    const focus = mock(async () => {});
    const log = mock(() => {});

    await runSessionizer({
      workspaces: {
        list: mock(async () => []),
        create,
        focus,
      },
      tabs,
      panes,
      config: testConfig(),
      pickRows: mock(async (_rows: readonly string[], options?: { prompt?: string }) => {
        if (options?.prompt === 'Switch session (Esc for new): ') {
          return null;
        }

        return ['/projects/herdr-sessionizer'];
      }),
      listProjects: mock(() => ['/projects/herdr-sessionizer']),
      createLayout,
      logger: { log, error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(create).toHaveBeenCalledWith({
      cwd: '/projects/herdr-sessionizer',
      label: 'herdr-sessionizer',
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledWith(workspace, '/projects/herdr-sessionizer', testConfig(), tabs, panes);
    expect(focus).toHaveBeenCalledWith('ws-new');
    expect(log).toHaveBeenCalledWith("✓ workspace 'herdr-sessionizer' created and focused (ws-new)");
  });
});
