import { describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { SessionizerConfig } from "../config/config.ts";
import type { Workspace } from "../client/types.ts";
import type { LayoutPanes, LayoutTabs } from "../layouts/project.ts";
import { runSessionizer } from "./sessionizer.ts";

function testConfig(): SessionizerConfig {
  return {
    projects: { roots: ["/projects"], git_only: false, depth: 1 },
    ui: { placement: "overlay" },
    layout: { focus: "assistant" },
    worktree: { github_prs: false },
    tabs: [],
  };
}

function testWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    workspace_id: "ws1",
    label: "fieldnotes",
    pane_count: 3,
    tab_count: 2,
    ...overrides,
  };
}

/** The row fzf would print back when the user picks `project`. */
function projectRowFor(rows: readonly string[], project: string): string {
  const row = rows.find((candidate) => candidate.split("\t")[3] === project);
  if (!row) throw new Error(`no row for ${project}`);
  return row;
}

function testTabs(): LayoutTabs {
  return {
    create: mock(async () => ({ tab_id: "ws1:t1", workspace_id: "ws1" })),
    rename: mock(async () => {}),
    focus: mock(async () => {}),
  };
}

function testPanes(): LayoutPanes {
  return {
    split: mock(async () => ({
      pane_id: "ws1-2",
      terminal_id: "term-2",
      workspace_id: "ws1",
      tab_id: "ws1:t1",
    })),
    run: mock(async () => {}),
    rename: mock(async () => {}),
  };
}

describe("runSessionizer", () => {
  it("focuses an existing workspace when selected from the first picker", async () => {
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
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(focus).toHaveBeenCalledWith("ws1");
    expect(pickRows).toHaveBeenCalledTimes(1);
  });

  it("lists open workspaces then projects in one picker", async () => {
    const pickRows = mock(async () => null);

    await runSessionizer({
      workspaces: {
        // Herdr omits cwd for workspaces Sessionizer did not create
        list: mock(async () => [testWorkspace()]),
        create: mock(async (_options) => testWorkspace()),
        focus: mock(async () => {}),
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pickRows,
      listProjects: mock(() => [
        "/projects/fieldnotes",
        "/projects/herdr-sessionizer",
        "/projects/org/api",
        "/elsewhere/tools",
      ]),
      listPanes: mock(async () => [
        {
          pane_id: "ws1:p1",
          terminal_id: "term-1",
          workspace_id: "ws1",
          tab_id: "ws1:t1",
          cwd: "/projects/fieldnotes/src",
        },
      ]),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(pickRows).toHaveBeenCalledTimes(1);
    const [rows, options] = pickRows.mock.calls[0] as unknown as [
      string[],
      { withNth?: string },
    ];
    // fieldnotes is open (a pane sits inside it), so only its workspace row is offered
    expect(rows.map((row) => row.split("\t")[1])).toEqual([
      "● fieldnotes",
      "  herdr-sessionizer",
      "  org/api",
      "  tools",
    ]);
    expect(options.withNth).toBe("2");
    // the workspace row borrows its pane's cwd so the preview can show the repo
    expect(rows[0]!.split("\t")[3]).toBe("/projects/fieldnotes/src");
  });

  it("does nothing when the picker is dismissed", async () => {
    const create = mock(async (_options) => testWorkspace());
    const focus = mock(async () => {});

    await runSessionizer({
      workspaces: {
        list: mock(async () => [testWorkspace()]),
        create,
        focus,
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pickRows: mock(async () => null),
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(create).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("opens a project in a new workspace when there are no workspaces yet", async () => {
    const create = mock(async (_options) =>
      testWorkspace({ workspace_id: "ws-project" })
    );
    const focus = mock(async () => {});

    await runSessionizer({
      workspaces: {
        list: mock(async () => []),
        create,
        focus,
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pickRows: mock(async (rows: readonly string[]) => [
        projectRowFor(rows, "/projects/fieldnotes"),
      ]),
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(create).toHaveBeenCalledWith({
      cwd: "/projects/fieldnotes",
      label: "fieldnotes",
      focus: false,
    });
    expect(focus).toHaveBeenCalledWith("ws-project");
  });

  it("exits with an error when no projects are found", async () => {
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
        listPanes: mock(async () => []),
        createLayout: mock(async (workspace: Workspace) => workspace),
        logger: { log: mock(() => {}), error },
        exit: (code) => {
          throw new Error(`exit ${code}`);
        },
      })
    ).rejects.toThrow("exit 1");

    expect(error).toHaveBeenCalledWith(
      "No projects found in configured directories."
    );
  });

  it("creates, lays out, and focuses a new workspace from the project picker", async () => {
    const tabs = testTabs();
    const panes = testPanes();
    const workspace = testWorkspace({
      cwd: "/projects/herdr-sessionizer",
      label: "herdr-sessionizer",
      workspace_id: "ws-new",
    });
    const create = mock(async () => workspace);
    const createLayout = mock(
      async (createdWorkspace: Workspace) => createdWorkspace
    );
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
      pickRows: mock(async (rows: readonly string[]) => [
        projectRowFor(rows, "/projects/herdr-sessionizer"),
      ]),
      listProjects: mock(() => ["/projects/herdr-sessionizer"]),
      listPanes: mock(async () => []),
      createLayout,
      logger: { log, error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(create).toHaveBeenCalledWith({
      cwd: "/projects/herdr-sessionizer",
      label: "herdr-sessionizer",
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledWith(
      workspace,
      "/projects/herdr-sessionizer",
      testConfig(),
      tabs,
      panes
    );
    expect(focus).toHaveBeenCalledWith("ws-new");
    expect(log).toHaveBeenCalledWith(
      "✓ workspace 'herdr-sessionizer' created and focused (ws-new)"
    );
  });

  it("applies a repo-local layout override when creating a new workspace", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "sessionizer-project-"));
    mkdirSync(join(projectRoot, ".sessionizer"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".sessionizer", "config.toml"),
      [
        "[layout]",
        'focus = "wiki"',
        "",
        "[tabs.wiki]",
        'label = "wiki"',
        "",
        "[[tabs.wiki.panes]]",
        'id = "git"',
        'title = "lazygit"',
        'command = "lazygit"',
        "",
      ].join("\n"),
      "utf-8"
    );

    const tabs = testTabs();
    const panes = testPanes();
    const workspace = testWorkspace({
      cwd: projectRoot,
      label: "repo-override",
      workspace_id: "ws-override",
    });
    const createLayout = mock(
      async (createdWorkspace: Workspace) => createdWorkspace
    );
    const config = testConfig();

    await runSessionizer({
      workspaces: {
        list: mock(async () => []),
        create: mock(async () => workspace),
        focus: mock(async () => {}),
      },
      tabs,
      panes,
      config,
      pickRows: mock(async (rows: readonly string[]) => [
        projectRowFor(rows, projectRoot),
      ]),
      listProjects: mock(() => [projectRoot]),
      listPanes: mock(async () => []),
      createLayout,
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(createLayout).toHaveBeenCalledWith(
      workspace,
      projectRoot,
      {
        ...config,
        ui: { placement: "overlay" },
        layout: { focus: "wiki" },
        worktree: { github_prs: false },
        tabs: [
          {
            id: "wiki",
            label: "wiki",
            panes: [
              {
                id: "git",
                from: undefined,
                title: "lazygit",
                split: undefined,
                command: "lazygit",
                accept_command_override: false,
              },
            ],
          },
        ],
      },
      tabs,
      panes
    );
  });
});
