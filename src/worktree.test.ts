import { describe, expect, it, mock } from "bun:test";

import { HerdrError } from "./client/errors.ts";
import type { Workspace } from "./client/types.ts";
import type { WorktreeFlowRuntime } from "./worktree-flow.ts";
import {
  type WorktreeCandidate,
  worktreeCandidateRow,
} from "./worktree-candidates.ts";
import { runWorktree } from "./worktree.ts";

function testWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    workspace_id: "ws-feature",
    cwd: "/repo",
    tab_count: 1,
    pane_count: 1,
    ...overrides,
  };
}

function testRuntime(
  overrides: Partial<WorktreeFlowRuntime> = {}
): WorktreeFlowRuntime {
  return {
    worktrees: {
      open: mock(async () => ({})),
      create: mock(async () => testWorkspace()),
    },
    workspaces: {
      list: mock(async () => []),
      get: mock(async () => undefined),
      focus: mock(async () => {}),
    },
    tabs: {},
    panes: {},
    config: {
      projects: { roots: ["/repo"] },
      layout: { placement: "overlay", focus: "terminal" },
      tabs: [],
    },
    resolver: { resolveExisting: mock(async () => undefined) },
    createLayout: mock(async (workspace: Workspace) => workspace),
    listProjects: mock(() => ["/repo"]),
    pickProject: mock(async () => ["/repo"]),
    pickWorktreeCandidate: mock(async () => null),
    promptBranch: mock(async () => "feature/test-flow"),
    discoverCandidates: mock(async () => []),
    attachExistingBranch: mock(async () => "/repo/feature-test-flow"),
    logger: { log: mock(() => {}), error: mock(() => {}) },
    exit: (code) => {
      throw new Error(`unexpected exit ${code}`);
    },
    ...overrides,
  };
}

describe("runWorktree", () => {
  it("reopens an existing worktree after create hits a duplicate-branch error without relayout", async () => {
    const duplicateBranchError = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: a branch named 'feature/test-flow' already exists"
    );
    const existingWorkspace = testWorkspace({
      worktree: {
        checkout_path: "/repo/feature-test-flow",
      },
    });
    const open = mock(
      async (options: {
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
          worktreePath: "/repo/feature-test-flow",
        };
      }
    );
    const create = mock(async () => {
      throw duplicateBranchError;
    });
    const focus = mock(async () => {});
    const resolveExisting = mock(async () => ({
      path: "/repo/feature-test-flow",
      source: "git-branch" as const,
    }));
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const attachExistingBranch = mock(async () => "/repo/feature-test-flow");
    const log = mock(() => {});

    await runWorktree(
      [
        "--project",
        "/repo",
        "--branch",
        "feature/test-flow",
        "--command",
        'copilot chat "fix this"',
      ],
      testRuntime({
        worktrees: { open, create },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => existingWorkspace),
          focus,
        },
        resolver: { resolveExisting },
        createLayout,
        attachExistingBranch,
        logger: { log, error: mock(() => {}) },
      })
    );

    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[0]?.[0]).toEqual({
      workspaceId: undefined,
      cwd: "/repo",
      branch: "feature/test-flow",
      focus: true,
    });
    expect(create).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: "/repo",
      branch: "feature/test-flow",
      base: undefined,
      label: "feature_test-flow",
      focus: false,
    });
    expect(resolveExisting).toHaveBeenCalledWith({
      project: "/repo",
      branch: "feature/test-flow",
      error: duplicateBranchError,
    });
    expect(open.mock.calls[1]?.[0]).toEqual({
      workspaceId: undefined,
      cwd: "/repo",
      path: "/repo/feature-test-flow",
      focus: true,
    });
    expect(createLayout).not.toHaveBeenCalled();
    expect(attachExistingBranch).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "✓ opened existing worktree path '/repo/feature-test-flow' for 'feature/test-flow'"
    );
  });

  it("attaches an existing branch as a new worktree when no existing checkout can be resolved", async () => {
    const duplicateBranchError = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: a branch named 'feature/test-flow' already exists"
    );
    const createdWorkspace = testWorkspace({
      worktree: {
        checkout_path: "/Users/mac/.herdr/worktrees/repo/feature-test-flow",
      },
    });
    const open = mock(
      async (options: {
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
          worktreePath: "/Users/mac/.herdr/worktrees/repo/feature-test-flow",
        };
      }
    );
    const create = mock(async () => {
      throw duplicateBranchError;
    });
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});
    const attachExistingBranch = mock(
      async () => "/Users/mac/.herdr/worktrees/repo/feature-test-flow"
    );
    const log = mock(() => {});

    await runWorktree(
      [
        "--project",
        "/repo",
        "--branch",
        "feature/test-flow",
        "--command",
        'kiro-cli chat "review this"',
      ],
      testRuntime({
        worktrees: { open, create },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => createdWorkspace),
          focus,
        },
        createLayout,
        attachExistingBranch,
        logger: { log, error: mock(() => {}) },
      })
    );

    expect(attachExistingBranch).toHaveBeenCalledWith(
      "/repo",
      "feature/test-flow"
    );
    expect(open.mock.calls[1]?.[0]).toEqual({
      workspaceId: undefined,
      cwd: "/repo",
      path: "/Users/mac/.herdr/worktrees/repo/feature-test-flow",
      label: "feature_test-flow",
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledWith(
      createdWorkspace,
      "/Users/mac/.herdr/worktrees/repo/feature-test-flow",
      {
        projects: { roots: ["/repo"] },
        layout: { placement: "overlay", focus: "terminal" },
        tabs: [],
      },
      {},
      {},
      {
        commandOverride: 'kiro-cli chat "review this"',
        branch: "feature/test-flow",
      }
    );
    expect(focus).toHaveBeenCalledWith("ws-feature");
    expect(log).toHaveBeenCalledWith(
      "✓ worktree 'feature/test-flow' created and focused (ws-feature)"
    );
  });

  it("rethrows non-duplicate create errors when no existing worktree can be resolved", async () => {
    const createError = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: repository is bare"
    );

    await expect(
      runWorktree(
        ["--project", "/repo", "--branch", "feature/test-flow"],
        testRuntime({
          worktrees: {
            open: mock(async () => {
              throw createError;
            }),
            create: mock(async () => {
              throw createError;
            }),
          },
        })
      )
    ).rejects.toBe(createError);
  });

  it("surfaces attach fallback errors when the target path is stale", async () => {
    const duplicateBranchError = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: a branch named 'feature/test-flow' already exists"
    );
    const stalePathError = new Error(
      "target worktree path '/Users/mac/.herdr/worktrees/repo/feature-test-flow' already exists but is not a reusable checkout for branch 'feature/test-flow'; remove or relocate that directory and retry"
    );

    await expect(
      runWorktree(
        ["--project", "/repo", "--branch", "feature/test-flow"],
        testRuntime({
          worktrees: {
            open: mock(async () => {
              throw duplicateBranchError;
            }),
            create: mock(async () => {
              throw duplicateBranchError;
            }),
          },
          attachExistingBranch: mock(async () => {
            throw stalePathError;
          }),
        })
      )
    ).rejects.toBe(stalePathError);
  });

  it("focuses an existing worktree workspace selected from the candidate picker without bootstrap", async () => {
    const candidate: WorktreeCandidate = {
      id: "workspace:ws-feature",
      kind: "workspace",
      label: "existing workspace  feature/test-flow",
      branch: "feature/test-flow",
      workspaceId: "ws-feature",
      path: "/worktrees/repo/feature-test-flow",
    };
    const focus = mock(async () => {});
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const log = mock(() => {});

    await runWorktree(
      [],
      testRuntime({
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => undefined),
          focus,
        },
        discoverCandidates: mock(async () => [candidate]),
        pickWorktreeCandidate: mock(async () => [
          worktreeCandidateRow(candidate),
        ]),
        createLayout,
        logger: { log, error: mock(() => {}) },
      })
    );

    expect(focus).toHaveBeenCalledWith("ws-feature");
    expect(createLayout).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "✓ focused existing worktree workspace 'feature/test-flow'"
    );
  });

  it("creates and bootstraps when an existing local branch is selected", async () => {
    const candidate: WorktreeCandidate = {
      id: "local:feature/test-flow",
      kind: "local-branch",
      label: "local branch        feature/test-flow",
      branch: "feature/test-flow",
    };
    const openError = new HerdrError(
      ["worktree", "open"],
      1,
      "no existing worktree"
    );
    const workspace = testWorkspace({
      workspace_id: "ws-created",
      worktree: {
        checkout_path: "/worktrees/repo/feature-test-flow",
      },
    });
    const create = mock(async () => workspace);
    const createLayout = mock(async (created: Workspace) => created);
    const focus = mock(async () => {});

    await runWorktree(
      [],
      testRuntime({
        worktrees: {
          open: mock(async () => {
            throw openError;
          }),
          create,
        },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => workspace),
          focus,
        },
        discoverCandidates: mock(async () => [candidate]),
        pickWorktreeCandidate: mock(async () => [
          worktreeCandidateRow(candidate),
        ]),
        createLayout,
      })
    );

    expect(create).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: "/repo",
      branch: "feature/test-flow",
      base: undefined,
      label: "feature_test-flow",
      focus: false,
    });
    expect(createLayout).toHaveBeenCalledWith(
      workspace,
      "/worktrees/repo/feature-test-flow",
      {
        projects: { roots: ["/repo"] },
        layout: { placement: "overlay", focus: "terminal" },
        tabs: [],
      },
      {},
      {},
      {
        commandOverride: undefined,
        branch: "feature/test-flow",
      }
    );
    expect(focus).toHaveBeenCalledWith("ws-created");
  });

  it("creates a local worktree from a selected remote branch base", async () => {
    const candidate: WorktreeCandidate = {
      id: "remote:origin/feature/remote",
      kind: "remote-branch",
      label: "remote branch       origin/feature/remote",
      branch: "feature/remote",
      base: "origin/feature/remote",
    };
    const workspace = testWorkspace({
      workspace_id: "ws-remote",
      worktree: {
        checkout_path: "/worktrees/repo/feature-remote",
      },
    });
    const create = mock(async () => workspace);

    await runWorktree(
      [],
      testRuntime({
        worktrees: {
          open: mock(async () => {
            throw new HerdrError(["worktree", "open"], 1, "not found");
          }),
          create,
        },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => workspace),
          focus: mock(async () => {}),
        },
        discoverCandidates: mock(async () => [candidate]),
        pickWorktreeCandidate: mock(async () => [
          worktreeCandidateRow(candidate),
        ]),
      })
    );

    expect(create).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: "/repo",
      branch: "feature/remote",
      base: "origin/feature/remote",
      label: "feature_remote",
      focus: false,
    });
  });

  it("prompts for a new branch when the candidate picker is dismissed", async () => {
    const candidate: WorktreeCandidate = {
      id: "local:feature/existing",
      kind: "local-branch",
      label: "local branch        feature/existing",
      branch: "feature/existing",
    };
    const promptBranch = mock(async () => "feature/new");
    const create = mock(async () => testWorkspace());

    await runWorktree(
      [],
      testRuntime({
        worktrees: {
          open: mock(async () => {
            throw new HerdrError(["worktree", "open"], 1, "not found");
          }),
          create,
        },
        discoverCandidates: mock(async () => [candidate]),
        pickWorktreeCandidate: mock(async () => null),
        promptBranch,
      })
    );

    expect(promptBranch).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: "/repo",
      branch: "feature/new",
      base: undefined,
      label: "feature_new",
      focus: false,
    });
  });

  it("skips the candidate picker and prompts when no candidates exist", async () => {
    const pickWorktreeCandidate = mock(async () => null);
    const promptBranch = mock(async () => "feature/new");

    await runWorktree(
      [],
      testRuntime({
        worktrees: {
          open: mock(async () => {
            throw new HerdrError(["worktree", "open"], 1, "not found");
          }),
          create: mock(async () => testWorkspace()),
        },
        discoverCandidates: mock(async () => []),
        pickWorktreeCandidate,
        promptBranch,
      })
    );

    expect(pickWorktreeCandidate).not.toHaveBeenCalled();
    expect(promptBranch).toHaveBeenCalled();
  });
});
