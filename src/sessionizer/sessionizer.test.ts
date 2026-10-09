import { describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { SessionizerConfig } from "../config/config.ts";
import type { Workspace } from "../client/types.ts";
import type { LayoutPanes, LayoutTabs } from "../layouts/project.ts";
import type { PickOptions } from "../ui/fzf.ts";
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
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(focus).toHaveBeenCalledWith("ws1");
    expect(pickRows).toHaveBeenCalledTimes(1);
  });

  it("falls through to the project picker when the existing-session picker is dismissed", async () => {
    const tabs = testTabs();
    const panes = testPanes();
    const create = mock(
      async ({ cwd, label }: { cwd: string; label: string }) =>
        testWorkspace({ cwd, label, workspace_id: "ws-project" })
    );
    const focus = mock(async () => {});
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const pickRows = mock(
      async (_rows: readonly string[], options?: { prompt?: string }) => {
        if (options?.prompt === "Switch session (Esc for new): ") {
          return null;
        }

        return ["/projects/fieldnotes"];
      }
    );

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
      listProjects: mock(() => ["/projects/fieldnotes"]),
      createLayout,
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    expect(pickRows).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      cwd: "/projects/fieldnotes",
      label: "fieldnotes",
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledWith(
      testWorkspace({
        cwd: "/projects/fieldnotes",
        label: "fieldnotes",
        workspace_id: "ws-project",
      }),
      "/projects/fieldnotes",
      testConfig(),
      tabs,
      panes
    );
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
      pickRows: mock(
        async (_rows: readonly string[], options?: { prompt?: string }) => {
          if (options?.prompt === "Switch session (Esc for new): ") {
            return null;
          }

          return ["/projects/herdr-sessionizer"];
        }
      ),
      listProjects: mock(() => ["/projects/herdr-sessionizer"]),
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
      pickRows: mock(
        async (_rows: readonly string[], options?: { prompt?: string }) => {
          if (options?.prompt === "Switch session (Esc for new): ") {
            return null;
          }

          return [projectRoot];
        }
      ),
      listProjects: mock(() => [projectRoot]),
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
    const pickRows = mock(
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
      pickRows,
      listProjects: mock(() => ["/projects/fieldnotes"]),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    const rows = pickRows.mock.calls[0]?.[0] ?? [];
    const worktreeRow = rows.find((row) => row.startsWith("ws-worktree\t"));
    const mainRow = rows.find((row) => row.startsWith("ws-main\t"));
    const plainRow = rows.find((row) => row.startsWith("ws-plain\t"));

    // Column 2 is the label shown by `withNth: "2"` and the preview `label:`.
    expect(worktreeRow?.split("\t")[1]).toBe("herdr-sessionizer / feature-x");
    expect(mainRow?.split("\t")[1]).toBe("repo");
    expect(plainRow?.split("\t")[1]).toBe("fieldnotes");
  });

  it("clusters rows by repo with plain workspaces first", async () => {
    const pickRows = mock(
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
      pickRows,
      listProjects: mock(() => ["/projects/fieldnotes"]),
      createLayout: mock(async (workspace: Workspace) => workspace),
      logger: { log: mock(() => {}), error: mock(() => {}) },
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });

    const rows = pickRows.mock.calls[0]?.[0] ?? [];
    expect(rows[0]).toContain("ws-plain"); // empty key sorts first
    expect(rows[1]).toContain("ws-repo-a"); // "repo-a" before "repo-b"
    expect(rows[2]).toContain("ws-repo-b"); // stable within the cluster
    expect(rows[3]).toContain("ws-repo-b-parent");
  });
});
