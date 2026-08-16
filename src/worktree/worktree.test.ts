import { describe, expect, it, mock } from "bun:test";

import { HerdrError } from "../client/errors.ts";
import type { Workspace } from "../client/types.ts";
import type { WorktreeFlowRuntime } from "./flow.ts";
import { intentFromCandidate } from "./flow.ts";
import { WORKTREE_CANDIDATE_PREVIEW } from "../ui/previews.ts";
import {
  type WorktreeCandidate,
  WORKTREE_CANDIDATE_ROW_DELIMITER,
  worktreeCandidateRow,
} from "./candidates.ts";
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
      open: mock(async () => ({ alreadyOpen: false })),
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
      projects: { roots: ["/repo"], git_only: false, depth: 1 },
      ui: { placement: "overlay" },
      layout: { focus: "terminal" },
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
    localBranchExists: mock(async () => true),
    fetchPullRequestHead: mock(async () => {}),
    logger: { log: mock(() => {}), error: mock(() => {}) },
    exit: (code) => {
      throw new Error(`unexpected exit ${code}`);
    },
    ...overrides,
  };
}

describe("intentFromCandidate", () => {
  it("maps pull-request candidates to create-pull-request intent", () => {
    expect(
      intentFromCandidate("/repo", {
        id: "pr:29",
        kind: "pull-request",
        label:
          "open pr  #29  fix(worktree): gate branch fallback  pperanich:fix/branch-exists-check",
        branch: "pr-29",
        prNumber: 29,
        title: "fix(worktree): gate branch fallback",
        headRefName: "fix/branch-exists-check",
        headOwner: "pperanich",
        previewPath: "/repo",
      })
    ).toEqual({
      kind: "create-pull-request",
      project: "/repo",
      branch: "pr-29",
      prNumber: 29,
      label: "pr-29-fix_worktree_gate",
    });
  });
});

describe("runWorktree", () => {
  it("reopens an existing worktree after create hits a duplicate-branch error and applies the layout", async () => {
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
          alreadyOpen: false,
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
      branchExists: true,
    });
    expect(open.mock.calls[1]?.[0]).toEqual({
      workspaceId: undefined,
      cwd: "/repo",
      path: "/repo/feature-test-flow",
      focus: true,
    });
    expect(createLayout).toHaveBeenCalledWith(
      existingWorkspace,
      "/repo/feature-test-flow",
      {
        projects: { roots: ["/repo"], git_only: false, depth: 1 },
        ui: { placement: "overlay" },
        layout: { focus: "terminal" },
        tabs: [],
      },
      {},
      {},
      {
        commandOverride: 'copilot chat "fix this"',
        branch: "feature/test-flow",
      }
    );
    expect(attachExistingBranch).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-feature");
    expect(log).toHaveBeenCalledWith(
      "✓ worktree 'feature/test-flow' opened and focused (ws-feature)"
    );
  });

  it("rethrows the create error when the local branch does not exist", async () => {
    const unrelatedError = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: could not create work tree dir: Permission denied"
    );
    const open = mock(async () => {
      throw unrelatedError;
    });
    const create = mock(async () => {
      throw unrelatedError;
    });
    const attachExistingBranch = mock(async () => "/unused");
    const runtime = testRuntime({
      worktrees: { open, create },
      localBranchExists: mock(async () => false),
      attachExistingBranch,
    });

    await expect(
      runWorktree(
        ["--project", "/repo", "--branch", "feature/test-flow"],
        runtime
      )
    ).rejects.toBe(unrelatedError);
    expect(attachExistingBranch).not.toHaveBeenCalled();
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
          alreadyOpen: false,
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
        projects: { roots: ["/repo"], git_only: false, depth: 1 },
        ui: { placement: "overlay" },
        layout: { focus: "terminal" },
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
      previewPath: "/repo",
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
        projects: { roots: ["/repo"], git_only: false, depth: 1 },
        ui: { placement: "overlay" },
        layout: { focus: "terminal" },
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

  it("shows a preview for branch picker candidates", async () => {
    const candidate: WorktreeCandidate = {
      id: "local:feature/test-flow",
      kind: "local-branch",
      label: "local branch        feature/test-flow",
      branch: "feature/test-flow",
      previewPath: "/repo",
    };
    const pickWorktreeCandidate = mock(async () => null);

    await runWorktree(
      [],
      testRuntime({
        discoverCandidates: mock(async () => [candidate]),
        pickWorktreeCandidate,
        promptBranch: mock(async () => "feature/new"),
        worktrees: {
          open: mock(async () => {
            throw new HerdrError(["worktree", "open"], 1, "not found");
          }),
          create: mock(async () => testWorkspace()),
        },
      })
    );

    expect(pickWorktreeCandidate).toHaveBeenCalledWith(
      [worktreeCandidateRow(candidate)],
      {
        prompt: "Worktree branch (Esc for new): ",
        header:
          "Enter opens existing or creates from branch; Esc creates a new branch",
        delimiter: WORKTREE_CANDIDATE_ROW_DELIMITER,
        withNth: "2,3",
        preview: WORKTREE_CANDIDATE_PREVIEW,
        previewWindow: "right:50%",
      }
    );
  });

  it("creates a local worktree from a selected remote branch base", async () => {
    const candidate: WorktreeCandidate = {
      id: "remote:origin/feature/remote",
      kind: "remote-branch",
      label: "remote branch       origin/feature/remote",
      branch: "feature/remote",
      base: "origin/feature/remote",
      previewPath: "/repo",
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

  it("fetches a PR head then creates and bootstraps a pr-N worktree", async () => {
    const candidate: WorktreeCandidate = {
      id: "pr:29",
      kind: "pull-request",
      label:
        "open pr  #29  fix(worktree): gate branch fallback  pperanich:fix/branch-exists-check",
      branch: "pr-29",
      prNumber: 29,
      title: "fix(worktree): gate branch fallback",
      headRefName: "fix/branch-exists-check",
      headOwner: "pperanich",
      previewPath: "/repo",
    };
    const workspace = testWorkspace({
      workspace_id: "ws-pr-29",
      worktree: {
        checkout_path: "/worktrees/repo/pr-29",
      },
    });
    const fetchPullRequestHead = mock(async () => {});
    const create = mock(async () => workspace);
    const createLayout = mock(async (created: Workspace) => created);
    const focus = mock(async () => {});

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
          focus,
        },
        discoverCandidates: mock(async () => [candidate]),
        pickWorktreeCandidate: mock(async () => [
          worktreeCandidateRow(candidate),
        ]),
        fetchPullRequestHead,
        createLayout,
      })
    );

    expect(fetchPullRequestHead).toHaveBeenCalledWith("/repo", 29, "pr-29");
    expect(create).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: "/repo",
      branch: "pr-29",
      base: undefined,
      label: "pr-29-fix_worktree_gate",
      focus: false,
    });
    expect(createLayout).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-pr-29");
  });

  it("does not fetch when reopening an existing pr-N workspace", async () => {
    const candidate: WorktreeCandidate = {
      id: "workspace:ws-pr-29",
      kind: "workspace",
      label: "existing workspace  pr-29",
      branch: "pr-29",
      workspaceId: "ws-pr-29",
      path: "/worktrees/repo/pr-29",
    };
    const fetchPullRequestHead = mock(async () => {});
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});

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
        fetchPullRequestHead,
        createLayout,
      })
    );

    expect(fetchPullRequestHead).not.toHaveBeenCalled();
    expect(createLayout).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-pr-29");
  });

  it("surfaces fetch failures without creating a worktree", async () => {
    const candidate: WorktreeCandidate = {
      id: "pr:29",
      kind: "pull-request",
      label: "open pr  #29  title  owner:head",
      branch: "pr-29",
      prNumber: 29,
      title: "title",
      headRefName: "head",
      headOwner: "owner",
      previewPath: "/repo",
    };
    const fetchError = new Error("git fetch failed for pull request #29");
    const create = mock(async () => testWorkspace());

    await expect(
      runWorktree(
        [],
        testRuntime({
          worktrees: {
            open: mock(async () => {
              throw new HerdrError(["worktree", "open"], 1, "not found");
            }),
            create,
          },
          discoverCandidates: mock(async () => [candidate]),
          pickWorktreeCandidate: mock(async () => [
            worktreeCandidateRow(candidate),
          ]),
          fetchPullRequestHead: mock(async () => {
            throw fetchError;
          }),
        })
      )
    ).rejects.toBe(fetchError);
    expect(create).not.toHaveBeenCalled();
  });

  it("prompts for a new branch when the candidate picker is dismissed", async () => {
    const candidate: WorktreeCandidate = {
      id: "local:feature/existing",
      kind: "local-branch",
      label: "local branch        feature/existing",
      branch: "feature/existing",
      previewPath: "/repo",
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

  it("exits without creating a worktree when the branch name prompt is cancelled", async () => {
    const create = mock(async () => testWorkspace());
    const open = mock(async () => {
      throw new HerdrError(["worktree", "open"], 1, "not found");
    });
    const promptBranch = mock(async () => null);

    await runWorktree(
      [],
      testRuntime({
        worktrees: { open, create },
        discoverCandidates: mock(async () => []),
        pickWorktreeCandidate: mock(async () => null),
        promptBranch,
      })
    );

    expect(promptBranch).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("exits without creating when Esc dismisses candidates then cancels the branch name", async () => {
    const candidate: WorktreeCandidate = {
      id: "local:feature/existing",
      kind: "local-branch",
      label: "local branch        feature/existing",
      branch: "feature/existing",
      previewPath: "/repo",
    };
    const create = mock(async () => testWorkspace());
    const open = mock(async () => {
      throw new HerdrError(["worktree", "open"], 1, "not found");
    });

    await runWorktree(
      [],
      testRuntime({
        worktrees: { open, create },
        discoverCandidates: mock(async () => [candidate]),
        pickWorktreeCandidate: mock(async () => null),
        promptBranch: mock(async () => null),
      })
    );

    expect(open).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("applies the layout when opening an existing worktree checkout", async () => {
    const candidate: WorktreeCandidate = {
      id: "worktree:/worktrees/repo/feature-test-flow",
      kind: "worktree",
      label: "worktree          feature/test-flow",
      branch: "feature/test-flow",
      path: "/worktrees/repo/feature-test-flow",
    };
    const openedWorkspace = testWorkspace({
      workspace_id: "ws-opened",
      worktree: {
        checkout_path: "/worktrees/repo/feature-test-flow",
      },
    });
    const open = mock(async () => ({
      workspace: openedWorkspace,
      worktreePath: "/worktrees/repo/feature-test-flow",
      alreadyOpen: false,
    }));
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});
    const log = mock(() => {});

    await runWorktree(
      [],
      testRuntime({
        worktrees: { open, create: mock(async () => testWorkspace()) },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => openedWorkspace),
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

    expect(open).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: "/repo",
      path: "/worktrees/repo/feature-test-flow",
      focus: true,
    });
    expect(createLayout).toHaveBeenCalledWith(
      openedWorkspace,
      "/worktrees/repo/feature-test-flow",
      {
        projects: { roots: ["/repo"], git_only: false, depth: 1 },
        ui: { placement: "overlay" },
        layout: { focus: "terminal" },
        tabs: [],
      },
      {},
      {},
      {
        commandOverride: undefined,
        branch: "feature/test-flow",
      }
    );
    expect(focus).toHaveBeenCalledWith("ws-opened");
    expect(log).toHaveBeenCalledWith(
      "✓ worktree 'feature/test-flow' opened and focused (ws-opened)"
    );
  });

  it("applies the layout when opening an existing worktree by project and branch", async () => {
    const openedWorkspace = testWorkspace({
      workspace_id: "ws-opened",
      worktree: {
        checkout_path: "/repo/feature-test-flow",
      },
    });
    const open = mock(async () => ({
      workspace: openedWorkspace,
      worktreePath: "/repo/feature-test-flow",
      alreadyOpen: false,
    }));
    const create = mock(async () => testWorkspace());
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});
    const log = mock(() => {});

    await runWorktree(
      ["--project", "/repo", "--branch", "feature/test-flow"],
      testRuntime({
        worktrees: { open, create },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => openedWorkspace),
          focus,
        },
        createLayout,
        logger: { log, error: mock(() => {}) },
      })
    );

    expect(open).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(createLayout).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith("ws-opened");
    expect(log).toHaveBeenCalledWith(
      "✓ worktree 'feature/test-flow' opened and focused (ws-opened)"
    );
  });

  it("focuses without layout when the picker opens a checkout whose workspace is already open", async () => {
    const candidate: WorktreeCandidate = {
      id: "worktree:/worktrees/repo/feature-test-flow",
      kind: "worktree",
      label: "worktree          feature/test-flow",
      branch: "feature/test-flow",
      path: "/worktrees/repo/feature-test-flow",
    };
    const openedWorkspace = testWorkspace({
      workspace_id: "ws-opened",
      worktree: {
        checkout_path: "/worktrees/repo/feature-test-flow",
      },
    });
    const open = mock(async () => ({
      workspace: openedWorkspace,
      worktreePath: "/worktrees/repo/feature-test-flow",
      alreadyOpen: true,
    }));
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});
    const log = mock(() => {});

    await runWorktree(
      [],
      testRuntime({
        worktrees: { open, create: mock(async () => testWorkspace()) },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => openedWorkspace),
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

    expect(open).toHaveBeenCalledWith({
      workspaceId: undefined,
      cwd: "/repo",
      path: "/worktrees/repo/feature-test-flow",
      focus: true,
    });
    expect(createLayout).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-opened");
    expect(log).toHaveBeenCalledWith(
      "✓ opened existing worktree path '/worktrees/repo/feature-test-flow' for 'feature/test-flow'"
    );
  });

  it("focuses without layout when opening an already-open worktree by project and branch", async () => {
    const openedWorkspace = testWorkspace({
      workspace_id: "ws-opened",
      worktree: {
        checkout_path: "/repo/feature-test-flow",
      },
    });
    const open = mock(async () => ({
      workspace: openedWorkspace,
      worktreePath: "/repo/feature-test-flow",
      alreadyOpen: true,
    }));
    const create = mock(async () => testWorkspace());
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});
    const log = mock(() => {});

    await runWorktree(
      ["--project", "/repo", "--branch", "feature/test-flow"],
      testRuntime({
        worktrees: { open, create },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => openedWorkspace),
          focus,
        },
        createLayout,
        logger: { log, error: mock(() => {}) },
      })
    );

    expect(open).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(createLayout).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-opened");
    expect(log).toHaveBeenCalledWith(
      "✓ opened existing worktree 'feature/test-flow'"
    );
  });

  it("skips the layout when the attach fallback opens a checkout whose workspace is already open", async () => {
    const duplicateBranchError = new HerdrError(
      ["worktree", "create"],
      1,
      "fatal: a branch named 'feature/test-flow' already exists"
    );
    const openedWorkspace = testWorkspace({
      workspace_id: "ws-opened",
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
        label?: string;
        focus?: boolean;
      }) => {
        if (options.branch) {
          throw duplicateBranchError;
        }

        return {
          workspace: openedWorkspace,
          worktreePath: "/repo/feature-test-flow",
          alreadyOpen: true,
        };
      }
    );
    const create = mock(async () => {
      throw duplicateBranchError;
    });
    const createLayout = mock(async (workspace: Workspace) => workspace);
    const focus = mock(async () => {});
    const log = mock(() => {});

    await runWorktree(
      ["--project", "/repo", "--branch", "feature/test-flow"],
      testRuntime({
        worktrees: { open, create },
        workspaces: {
          list: mock(async () => []),
          get: mock(async () => openedWorkspace),
          focus,
        },
        createLayout,
        attachExistingBranch: mock(async () => "/repo/feature-test-flow"),
        logger: { log, error: mock(() => {}) },
      })
    );

    expect(createLayout).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith("ws-opened");
    expect(log).toHaveBeenCalledWith(
      "✓ attached existing branch 'feature/test-flow' at '/repo/feature-test-flow'"
    );
  });
});
