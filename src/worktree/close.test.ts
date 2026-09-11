import { describe, expect, it, mock } from "bun:test";

import { HerdrError } from "../client/errors.ts";
import type { Workspace } from "../client/types.ts";
import type { PickOptions } from "../ui/fzf.ts";
import {
  WORKSPACE_CLOSE_PREVIEW,
  WORKTREE_CLOSE_PREVIEW,
} from "../ui/previews.ts";
import type { CloseRuntime } from "./close.ts";
import { runClosePicker } from "./close.ts";

function worktreeWorkspace(): Workspace {
  return {
    workspace_id: "ws-worktree",
    label: "feature/test-flow",
    cwd: "/worktrees/repo/feature-test-flow",
    tab_count: 2,
    pane_count: 1,
    worktree: {
      branch: "feature/test-flow",
      repo_name: "repo",
      checkout_path: "/worktrees/repo/feature-test-flow",
      is_linked_worktree: true,
    },
  };
}

function projectWorkspace(): Workspace {
  return {
    workspace_id: "ws-project",
    label: "repo",
    cwd: "/repo",
    tab_count: 1,
    pane_count: 1,
  };
}

function testRuntime(overrides: Partial<CloseRuntime> = {}): CloseRuntime {
  return {
    workspaces: { list: mock(async () => []) },
    close: mock(async (_workspaceId: string) => {}),
    remove: mock(async (_workspaceId: string) => {}),
    pickRows: mock(
      async (_rows: readonly string[], _options?: PickOptions) => null
    ),
    logger: { log: mock(() => {}), error: mock(() => {}) },
    exit: (code) => {
      throw new Error(`exit ${code}`);
    },
    ...overrides,
  };
}

describe("runClosePicker", () => {
  it("prints a hint and exits 0 when there are no open workspaces (close mode)", async () => {
    const log = mock(() => {});

    await expect(
      runClosePicker(
        "close",
        testRuntime({
          workspaces: { list: mock(async () => []) },
          logger: { log, error: mock(() => {}) },
        })
      )
    ).rejects.toThrow("exit 0");

    expect(log).toHaveBeenCalledWith(
      "No open workspaces. Create one with `sessionizer.open`."
    );
  });

  it("prints a worktree hint and exits 0 when remove mode has no worktree workspaces", async () => {
    const log = mock(() => {});

    await expect(
      runClosePicker(
        "remove",
        testRuntime({
          // A project workspace is filtered out in remove mode.
          workspaces: { list: mock(async () => [projectWorkspace()]) },
          logger: { log, error: mock(() => {}) },
        })
      )
    ).rejects.toThrow("exit 0");

    expect(log).toHaveBeenCalledWith(
      "No open worktree workspaces. Create one with `sessionizer.worktree-open`."
    );
  });

  it("filters out the parent/main repo workspace in remove mode (only linked worktrees)", async () => {
    const pickRows = mock(
      async (_rows: readonly string[], _options?: PickOptions) => null
    );

    await runClosePicker(
      "remove",
      testRuntime({
        workspaces: {
          list: mock(async () => [
            worktreeWorkspace(),
            {
              // Parent repo: carries worktree provenance but is not itself a
              // linked worktree — must be excluded from the destructive picker.
              workspace_id: "ws-parent",
              label: "repo",
              cwd: "/repo",
              worktree: {
                repo_name: "repo",
                checkout_path: "/repo",
                is_linked_worktree: false,
              },
            },
          ]),
        },
        pickRows,
      })
    );

    const rows = pickRows.mock.calls[0]?.[0];
    expect(rows?.length).toBe(1);
    expect(rows?.[0]).toContain("ws-worktree");
  });

  it("sorts rows by repo so same-repo worktrees group together", async () => {
    const pickRows = mock(
      async (_rows: readonly string[], _options?: PickOptions) => null
    );

    await runClosePicker(
      "remove",
      testRuntime({
        workspaces: {
          list: mock(async () => [
            worktreeWorkspace(), // repo "repo"
            {
              ...worktreeWorkspace(),
              workspace_id: "ws-alpha",
              worktree: { repo_name: "alpha", is_linked_worktree: true },
            },
          ]),
        },
        pickRows,
      })
    );

    const rows = pickRows.mock.calls[0]?.[0];
    expect(rows?.[0]).toContain("ws-alpha"); // "alpha" sorts before "repo"
    expect(rows?.[1]).toContain("ws-worktree");
  });

  it("closes a single selected workspace and logs a summary", async () => {
    const close = mock(async (_workspaceId: string) => {});
    const log = mock(() => {});
    const pickRows = mock(async (rows: readonly string[]) => [rows[0]!]);

    await runClosePicker(
      "close",
      testRuntime({
        workspaces: { list: mock(async () => [worktreeWorkspace()]) },
        close,
        pickRows,
        logger: { log, error: mock(() => {}) },
        exit: (code) => {
          throw new Error(`unexpected exit ${code}`);
        },
      })
    );

    expect(close).toHaveBeenCalledWith("ws-worktree");
    expect(log).toHaveBeenCalledWith("✓ closed ws-worktree");
    expect(log).toHaveBeenCalledWith("Closed 1 workspace(s), 0 failed.");
  });

  it("closes a parent workspace with --group", async () => {
    const close = mock(
      async (_workspaceId: string, _options?: { group?: boolean }) => {}
    );
    const log = mock(() => {});
    const pickRows = mock(async (rows: readonly string[]) => [rows[0]!]);

    await runClosePicker(
      "close",
      testRuntime({
        workspaces: {
          list: mock(async () => [
            {
              workspace_id: "ws-parent",
              label: "repo",
              cwd: "/repo",
              worktree: {
                repo_name: "repo",
                checkout_path: "/repo",
                is_linked_worktree: false,
              },
            },
          ]),
        },
        close,
        pickRows,
        logger: { log, error: mock(() => {}) },
        exit: (code) => {
          throw new Error(`unexpected exit ${code}`);
        },
      })
    );

    expect(close).toHaveBeenCalledWith("ws-parent", { group: true });
    expect(log).toHaveBeenCalledWith("✓ closed ws-parent");
    expect(log).toHaveBeenCalledWith("Closed 1 workspace(s), 0 failed.");
  });

  it("skips a child worktree covered by a selected parent's group close", async () => {
    const close = mock(
      async (_workspaceId: string, _options?: { group?: boolean }) => {}
    );
    const log = mock(() => {});
    const pickRows = mock(async (rows: readonly string[]) => [
      rows[0]!,
      rows[1]!,
    ]);

    await runClosePicker(
      "close",
      testRuntime({
        workspaces: {
          list: mock(async () => [
            worktreeWorkspace(), // child, repo "repo"
            {
              workspace_id: "ws-parent",
              label: "repo",
              cwd: "/repo",
              worktree: {
                repo_name: "repo",
                checkout_path: "/repo",
                is_linked_worktree: false,
              },
            },
          ]),
        },
        close,
        pickRows,
        logger: { log, error: mock(() => {}) },
        exit: (code) => {
          throw new Error(`unexpected exit ${code}`);
        },
      })
    );

    // The child is covered by the parent's group close — only the parent runs.
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith("ws-parent", { group: true });
    expect(log).toHaveBeenCalledWith(
      "✓ closed ws-worktree (covered by group close)"
    );
    expect(log).toHaveBeenCalledWith("✓ closed ws-parent");
    expect(log).toHaveBeenCalledWith("Closed 2 workspace(s), 0 failed.");
  });

  it("passes multi-select and close preview options in close mode", async () => {
    const pickRows = mock(
      async (_rows: readonly string[], _options?: PickOptions) => null
    );

    await runClosePicker(
      "close",
      testRuntime({
        workspaces: { list: mock(async () => [worktreeWorkspace()]) },
        pickRows,
      })
    );

    const options = pickRows.mock.calls[0]?.[1];
    expect(options?.multi).toBe(true);
    expect(options?.prompt).toBe("Close workspace: ");
    expect(options?.preview).toBe(WORKSPACE_CLOSE_PREVIEW);
    expect(options?.withNth).toBe("2");
  });

  it("passes remove preview options and filters to worktree workspaces in remove mode", async () => {
    const pickRows = mock(
      async (_rows: readonly string[], _options?: PickOptions) => null
    );

    await runClosePicker(
      "remove",
      testRuntime({
        workspaces: {
          list: mock(async () => [worktreeWorkspace(), projectWorkspace()]),
        },
        pickRows,
      })
    );

    const rows = pickRows.mock.calls[0]?.[0];
    expect(rows?.length).toBe(1);
    expect(rows?.[0]).toContain("ws-worktree");

    const options = pickRows.mock.calls[0]?.[1];
    expect(options?.prompt).toBe("Remove worktree: ");
    expect(options?.preview).toBe(WORKTREE_CLOSE_PREVIEW);
    expect(options?.multi).toBe(true);
  });

  it("removes multiple worktrees and reports per-row failures without aborting the batch", async () => {
    const removeError = new HerdrError(
      ["worktree", "remove"],
      1,
      "dirty worktree"
    );
    const remove = mock(async (workspaceId: string) => {
      if (workspaceId === "ws-project") throw removeError;
    });
    const log = mock(() => {});
    const error = mock((_message: string) => {});

    await expect(
      runClosePicker(
        "remove",
        testRuntime({
          workspaces: {
            list: mock(async () => [
              worktreeWorkspace(),
              {
                ...projectWorkspace(),
                workspace_id: "ws-project",
                worktree: { repo_name: "repo", is_linked_worktree: true },
              },
            ]),
          },
          remove,
          pickRows: mock(async (rows: readonly string[]) => [
            rows[0]!,
            rows[1]!,
          ]),
          logger: { log, error },
        })
      )
    ).rejects.toThrow("exit 1");

    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[0]?.[0]).toBe("ws-worktree");
    expect(remove.mock.calls[1]?.[0]).toBe("ws-project");
    expect(log).toHaveBeenCalledWith("✓ removed ws-worktree");
    expect(error.mock.calls[0]?.[0]).toContain(
      "✗ failed to removed ws-project"
    );
    expect(error.mock.calls[0]?.[0]).toContain("dirty worktree");
    expect(log).toHaveBeenCalledWith("Removed 1 worktree(s), 1 failed.");
  });

  it("shows the mode menu first and acts on the selected mode", async () => {
    const close = mock(async (_workspaceId: string) => {});
    const pickRows = mock(
      async (rows: readonly string[], options?: { prompt?: string }) => {
        if (options?.prompt === "Close workspaces: ") {
          return [rows[0]!]; // close mode selected
        }
        return [rows[0]!]; // workspace row
      }
    );

    await runClosePicker(
      undefined,
      testRuntime({
        workspaces: { list: mock(async () => [worktreeWorkspace()]) },
        close,
        pickRows,
      })
    );

    expect(pickRows).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledWith("ws-worktree");
  });

  it("returns without acting when the mode menu is cancelled", async () => {
    const close = mock(async (_workspaceId: string) => {});

    await runClosePicker(
      undefined,
      testRuntime({
        workspaces: { list: mock(async () => [worktreeWorkspace()]) },
        close,
        pickRows: mock(
          async (_rows: readonly string[], _options?: PickOptions) => null
        ),
      })
    );

    expect(close).not.toHaveBeenCalled();
  });

  it("returns without acting when the workspace picker is cancelled", async () => {
    const close = mock(async (_workspaceId: string) => {});

    await runClosePicker(
      "close",
      testRuntime({
        workspaces: { list: mock(async () => [worktreeWorkspace()]) },
        close,
        pickRows: mock(
          async (_rows: readonly string[], _options?: PickOptions) => null
        ),
      })
    );

    expect(close).not.toHaveBeenCalled();
  });
});
