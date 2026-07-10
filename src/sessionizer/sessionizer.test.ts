import { describe, expect, it, mock } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { SessionizerConfig } from "../config/config.ts";
import type { Frecency } from "../frecency/frecency.ts";
import type { Workspace } from "../client/types.ts";
import type { LayoutPanes, LayoutTabs } from "../layouts/project.ts";
import { runSessionizer } from "./sessionizer.ts";
import {
  candidateRow,
  directoryCandidate,
  openCandidates,
} from "./candidates.ts";
import type { RowDeps } from "./rows.ts";

function testConfig(): SessionizerConfig {
  return {
    projects: { roots: ["/projects"], git_only: false, depth: 1 },
    find: { roots: ["~"], depth: 2 },
    current: { enabled: true, siblings: true, children: true },
    recent: { enabled: true, limit: 50 },
    layout: { placement: "overlay", focus: "assistant" },
    tabs: [],
  };
}

function testWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    workspace_id: "ws1",
    label: "fieldnotes",
    cwd: "/projects/fieldnotes",
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

function testFrecency(): Frecency {
  return {
    list: mock(() => []),
    add: mock(() => {}),
  };
}

interface RuntimeOverrides {
  workspaces?: Partial<{
    list: () => Promise<Workspace[]>;
    create: (options: {
      cwd: string;
      label: string;
      focus?: boolean;
    }) => Promise<Workspace>;
    focus: (workspaceId: string) => Promise<void>;
  }>;
  frecency?: Frecency;
  rowDepsOverrides?: Partial<RowDeps>;
  config?: SessionizerConfig;
  applyLayout?: boolean;
  tabs?: LayoutTabs;
  panes?: LayoutPanes;
  pickRows?: (
    rows: readonly string[],
    options?: unknown
  ) => Promise<string[] | null>;
  createLayout?: (workspace: Workspace) => Promise<Workspace>;
  logger?: { log: (m?: unknown) => void; error: (m?: unknown) => void };
  exit?: (code: number) => never;
}

function buildRuntime(overrides: RuntimeOverrides) {
  const frecency = overrides.frecency ?? testFrecency();
  const workspaces = {
    list: overrides.workspaces?.list ?? mock(async () => []),
    create: overrides.workspaces?.create ?? mock(async () => testWorkspace()),
    focus: overrides.workspaces?.focus ?? mock(async () => {}),
  };
  const rowDeps: RowDeps = {
    listWorkspaces: workspaces.list,
    frecency,
    listProjects: mock(() => []),
    listCurrentDirectories: mock(() => []),
    runFind: mock(() => []),
    dirExists: mock(() => true),
    ...overrides.rowDepsOverrides,
  };

  return {
    runtime: {
      workspaces,
      tabs: overrides.tabs ?? testTabs(),
      panes: overrides.panes ?? testPanes(),
      config: overrides.config ?? testConfig(),
      frecency,
      applyLayout: overrides.applyLayout ?? false,
      rowDeps,
      pickRows: overrides.pickRows ?? mock(async () => null),
      createLayout:
        overrides.createLayout ??
        mock(async (workspace: Workspace) => workspace),
      resolveCwd: () => "/projects",
      reloadBinds: () => [],
      logger: overrides.logger ?? {
        log: mock(() => {}),
        error: mock(() => {}),
      },
      exit:
        overrides.exit ??
        ((code: number) => {
          throw new Error(`unexpected exit ${code}`);
        }),
    },
    workspaces,
    frecency,
  };
}

describe("runSessionizer", () => {
  it("focuses an open workspace when its row is selected", async () => {
    const focus = mock(async () => {});
    const { runtime } = buildRuntime({
      workspaces: { list: mock(async () => [testWorkspace()]), focus },
      pickRows: mock(async (rows: readonly string[]) => [
        rows.find((r) => r.startsWith("ws:"))!,
      ]),
    });

    await runSessionizer(runtime);

    expect(focus).toHaveBeenCalledWith("ws1");
  });

  it("creates and focuses a plain terminal workspace by default (no layout)", async () => {
    const created = testWorkspace({
      cwd: "/projects/new-app",
      label: "new-app",
      workspace_id: "ws-new",
    });
    const create = mock(async () => created);
    const focus = mock(async () => {});
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const log = mock(() => {});
    const frecency = testFrecency();

    const { runtime } = buildRuntime({
      workspaces: { list: mock(async () => []), create, focus },
      frecency,
      rowDepsOverrides: { listProjects: mock(() => ["/projects/new-app"]) },
      createLayout,
      logger: { log, error: mock(() => {}) },
      pickRows: mock(async (rows: readonly string[]) => [
        rows.find((r) => r.startsWith("dir:"))!,
      ]),
    });

    await runSessionizer(runtime);

    expect(create).toHaveBeenCalledWith({
      cwd: "/projects/new-app",
      label: "new-app",
      focus: false,
    });
    // Default open opens a terminal at the folder — no layout applied.
    expect(createLayout).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-new");
    expect(frecency.add).toHaveBeenCalledWith("/projects/new-app");
    expect(log).toHaveBeenCalledWith(
      "✓ workspace 'new-app' created and focused (ws-new)"
    );
  });

  it("applies the configured layout when opened with applyLayout", async () => {
    const created = testWorkspace({
      cwd: "/projects/new-app",
      label: "new-app",
      workspace_id: "ws-new",
    });
    const create = mock(async () => created);
    const createLayout = mock(async (workspace: Workspace) => workspace);

    const { runtime } = buildRuntime({
      applyLayout: true,
      workspaces: { list: mock(async () => []), create },
      rowDepsOverrides: { listProjects: mock(() => ["/projects/new-app"]) },
      createLayout,
      pickRows: mock(async (rows: readonly string[]) => [
        rows.find((r) => r.startsWith("dir:"))!,
      ]),
    });

    await runSessionizer(runtime);

    expect(createLayout).toHaveBeenCalledWith(
      created,
      "/projects/new-app",
      runtime.config,
      runtime.tabs,
      runtime.panes
    );
  });

  it("focuses an existing workspace when a directory row matches its cwd", async () => {
    // Simulates a find-mode selection whose path already backs an open
    // workspace; resolution must reopen it, not create a duplicate.
    const create = mock(async () => testWorkspace());
    const focus = mock(async () => {});
    const { runtime } = buildRuntime({
      workspaces: {
        list: mock(async () => [
          testWorkspace({ workspace_id: "ws-open", cwd: "/projects/existing" }),
        ]),
        create,
        focus,
      },
      pickRows: mock(async () => [
        candidateRow(directoryCandidate("/projects/existing", "find")),
      ]),
    });

    await runSessionizer(runtime);

    expect(focus).toHaveBeenCalledWith("ws-open");
    expect(create).not.toHaveBeenCalled();
  });

  it("applies a repo-local layout override when creating from a directory row", async () => {
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

    const created = testWorkspace({
      cwd: projectRoot,
      label: "repo-override",
      workspace_id: "ws-override",
    });
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const config = testConfig();

    const { runtime } = buildRuntime({
      applyLayout: true,
      workspaces: {
        list: mock(async () => []),
        create: mock(async () => created),
      },
      config,
      createLayout,
      rowDepsOverrides: { listProjects: mock(() => [projectRoot]) },
      pickRows: mock(async (rows: readonly string[]) => [
        rows.find((r) => r.startsWith("dir:"))!,
      ]),
    });

    await runSessionizer(runtime);

    expect(createLayout).toHaveBeenCalledWith(
      created,
      projectRoot,
      {
        ...config,
        layout: { placement: "overlay", focus: "wiki" },
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
      runtime.tabs,
      runtime.panes
    );
  });

  it("exits with an error when no candidates are found", async () => {
    const error = mock(() => {});

    await expect(
      runSessionizer(
        buildRuntime({
          logger: { log: mock(() => {}), error },
          exit: (code) => {
            throw new Error(`exit ${code}`);
          },
        }).runtime
      )
    ).rejects.toThrow("exit 1");

    expect(error).toHaveBeenCalledWith(
      "No open sessions, recent directories, or project folders found."
    );
  });

  it("does nothing when the picker is dismissed", async () => {
    const create = mock(async () => testWorkspace());
    const focus = mock(async () => {});
    const { runtime } = buildRuntime({
      workspaces: { list: mock(async () => [testWorkspace()]), create, focus },
      pickRows: mock(async () => null),
    });

    await runSessionizer(runtime);

    expect(create).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("presents open workspaces and project roots in the merged default list", async () => {
    let presentedRows: readonly string[] = [];
    const { runtime } = buildRuntime({
      workspaces: {
        list: mock(async () => [
          testWorkspace({ workspace_id: "ws-a", cwd: "/projects/alpha" }),
        ]),
      },
      rowDepsOverrides: { listProjects: mock(() => ["/projects/beta"]) },
      pickRows: mock(async (rows: readonly string[]) => {
        presentedRows = rows;
        return null;
      }),
    });

    await runSessionizer(runtime);

    const openRows = openCandidates([
      testWorkspace({ workspace_id: "ws-a", cwd: "/projects/alpha" }),
    ]);
    expect(presentedRows.some((r) => r.startsWith("ws:ws-a"))).toBe(true);
    expect(presentedRows.some((r) => r === candidateRow(openRows[0]!))).toBe(
      true
    );
    expect(presentedRows.some((r) => r.startsWith("dir:/projects/beta"))).toBe(
      true
    );
  });
});
