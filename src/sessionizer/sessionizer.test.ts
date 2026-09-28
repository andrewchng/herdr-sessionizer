import { describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { SessionizerConfig } from "../config/config.ts";
import type { Workspace } from "../client/types.ts";
import type { LayoutPanes, LayoutTabs } from "../layouts/project.ts";
import type { PickOptions } from "../ui/fzf.ts";
import { newProjectPath, runSessionizer } from "./sessionizer.ts";

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
    const pick = mock(async (rows: readonly string[]) => ({
      kind: "row" as const,
      row: rows[0]!,
    }));

    await runSessionizer({
      workspaces: {
        list: mock(async () => [testWorkspace()]),
        create: mock(async (_options) => testWorkspace()),
        focus,
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pick,
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(focus).toHaveBeenCalledWith("ws1");
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it("lists open workspaces then projects in one picker", async () => {
    const pick = mock(async () => null);

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
      pick,
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
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(pick).toHaveBeenCalledTimes(1);
    const [rows, options] = pick.mock.calls[0] as unknown as [
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
      pick: mock(async () => null),
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
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
      pick: mock(async (rows: readonly string[]) => ({
        kind: "row" as const,
        row: projectRowFor(rows, "/projects/fieldnotes"),
      })),
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
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

  it("still opens the picker with no projects, so a name can be typed", async () => {
    const pick = mock(async () => null);

    await runSessionizer({
      workspaces: {
        list: mock(async () => []),
        create: mock(async (_options) => testWorkspace()),
        focus: mock(async () => {}),
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pick,
      listProjects: mock(() => []),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(pick).toHaveBeenCalledTimes(1);
    const [, options] = pick.mock.calls[0] as unknown as [
      string[],
      { createKey?: string },
    ];
    expect(options.createKey).toBe("ctrl-n");
  });

  it("creates a typed project under the first root, git inits it, and opens it", async () => {
    const create = mock(async (_options) =>
      testWorkspace({ workspace_id: "ws-new" })
    );
    const focus = mock(async () => {});
    const makeProjectDir = mock(() => true);
    const initRepo = mock(() => {});
    const createLayout = mock(async (workspace: Workspace) => workspace);

    await runSessionizer({
      workspaces: { list: mock(async () => []), create, focus },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pick: mock(async () => ({
        kind: "create" as const,
        query: "org/my app",
      })),
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      makeProjectDir,
      initRepo,
      createLayout,
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(makeProjectDir).toHaveBeenCalledWith("/projects/org/my-app");
    expect(initRepo).toHaveBeenCalledWith("/projects/org/my-app");
    expect(create).toHaveBeenCalledWith({
      cwd: "/projects/org/my-app",
      label: "my-app",
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith("ws-new");
  });

  it("does not git init a typed project that already exists", async () => {
    const initRepo = mock(() => {});
    const create = mock(async (_options) => testWorkspace());

    await runSessionizer({
      workspaces: {
        list: mock(async () => []),
        create,
        focus: mock(async () => {}),
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pick: mock(async () => ({ kind: "create" as const, query: "notes" })),
      listProjects: mock(() => []),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo,
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(initRepo).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("focuses the open workspace when the typed name is already open", async () => {
    const create = mock(async (_options) => testWorkspace());
    const focus = mock(async () => {});

    await runSessionizer({
      workspaces: {
        list: mock(async () => [
          testWorkspace({
            workspace_id: "ws-open",
            cwd: "/projects/fieldnotes",
          }),
        ]),
        create,
        focus,
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pick: mock(async () => ({
        kind: "create" as const,
        query: "fieldnotes",
      })),
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(create).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-open");
  });

  it("refuses a typed name that escapes the root", async () => {
    const error = mock(() => {});
    const makeProjectDir = mock(() => true);

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
        pick: mock(async () => ({ kind: "create" as const, query: "../x" })),
        listProjects: mock(() => []),
        listPanes: mock(async () => []),
        makeProjectDir,
        initRepo: mock(() => {}),
        createLayout: mock(async (workspace: Workspace) => workspace),
        logger: { log: mock(() => {}), error },
        exit: (code) => {
          throw new Error(`exit ${code}`);
        },
      })
    ).rejects.toThrow("exit 1");

    expect(error).toHaveBeenCalledWith("Invalid project name: ../x");
    expect(makeProjectDir).not.toHaveBeenCalled();
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
      pick: mock(async (rows: readonly string[]) => ({
        kind: "row" as const,
        row: projectRowFor(rows, "/projects/herdr-sessionizer"),
      })),
      listProjects: mock(() => ["/projects/herdr-sessionizer"]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
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
      pick: mock(async (rows: readonly string[]) => ({
        kind: "row" as const,
        row: projectRowFor(rows, projectRoot),
      })),
      listProjects: mock(() => [projectRoot]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
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

  it("prefixes linked-worktree labels with the parent repo name", async () => {
    const pick = mock(
      async (_rows: readonly string[], _options?: PickOptions) => null
    );

    await runSessionizer({
      workspaces: {
        list: mock(async () => [
          {
            workspace_id: "ws-worktree",
            label: "feature-x",
            worktree: {
              repo_name: "herdr-sessionizer",
              checkout_path: "/worktrees/herdr-sessionizer/feature-x",
              is_linked_worktree: true,
            },
          },
          {
            workspace_id: "ws-main",
            label: "repo",
            worktree: {
              repo_name: "repo",
              checkout_path: "/repo",
              is_linked_worktree: false,
            },
          },
          testWorkspace({ workspace_id: "ws-plain", label: "fieldnotes" }),
        ]),
        create: mock(async (_options) => testWorkspace()),
        focus: mock(async () => {}),
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pick,
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    const rows = pick.mock.calls[0]?.[0] ?? [];
    const worktreeRow = rows.find((row) => row.startsWith("ws-worktree\t"));
    const mainRow = rows.find((row) => row.startsWith("ws-main\t"));
    const plainRow = rows.find((row) => row.startsWith("ws-plain\t"));

    // Column 2 is the label shown by `withNth: "2"` and the preview `label:`.
    expect(worktreeRow?.split("\t")[1]).toBe("● herdr-sessionizer / feature-x");
    expect(mainRow?.split("\t")[1]).toBe("● repo");
    expect(plainRow?.split("\t")[1]).toBe("● fieldnotes");
  });

  it("clusters rows by repo with plain workspaces first", async () => {
    const pick = mock(
      async (_rows: readonly string[], _options?: PickOptions) => null
    );

    await runSessionizer({
      workspaces: {
        list: mock(async () => [
          {
            workspace_id: "ws-repo-b",
            label: "b",
            worktree: { repo_name: "repo-b", is_linked_worktree: true },
          },
          testWorkspace({ workspace_id: "ws-plain", label: "plain" }),
          {
            workspace_id: "ws-repo-a",
            label: "a",
            worktree: { repo_name: "repo-a", is_linked_worktree: true },
          },
          {
            workspace_id: "ws-repo-b-parent",
            label: "repo-b",
            worktree: { repo_name: "repo-b", is_linked_worktree: false },
          },
        ]),
        create: mock(async (_options) => testWorkspace()),
        focus: mock(async () => {}),
      },
      tabs: testTabs(),
      panes: testPanes(),
      config: testConfig(),
      pick,
      listProjects: mock(() => ["/projects/fieldnotes"]),
      listPanes: mock(async () => []),
      makeProjectDir: mock(() => false),
      initRepo: mock(() => {}),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    const rows = pick.mock.calls[0]?.[0] ?? [];
    expect(rows[0]).toContain("ws-plain"); // empty key sorts first
    expect(rows[1]).toContain("ws-repo-a"); // "repo-a" before "repo-b"
    expect(rows[2]).toContain("ws-repo-b"); // stable within the cluster
    expect(rows[3]).toContain("ws-repo-b-parent");
  });
});

describe("newProjectPath", () => {
  it("joins the query under the root, dashing spaces", () => {
    expect(newProjectPath("/code/", "my app")).toBe("/code/my-app");
    expect(newProjectPath("/code", " org / repo ")).toBe("/code/org/repo");
  });

  it("refuses names that escape the root", () => {
    expect(newProjectPath("/code", "/etc")).toBeNull();
    expect(newProjectPath("/code", "~/x")).toBeNull();
    expect(newProjectPath("/code", "a/../../x")).toBeNull();
    expect(newProjectPath("/code", "./x")).toBeNull();
    expect(newProjectPath("/code", "//")).toBeNull();
  });
});
