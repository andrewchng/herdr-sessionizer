import { describe, expect, it, mock } from "bun:test";

import type { Workspace } from "./client/types.ts";
import {
  buildWorktreeCandidates,
  discoverWorktreeCandidates,
  parseGitBranchLines,
  parseGitWorktreePorcelain,
  worktreeCandidateFromRow,
  worktreeCandidateRow,
} from "./worktree-candidates.ts";

function worktreeWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    workspace_id: "ws-feature",
    cwd: "/worktrees/repo/feature-test",
    worktree: {
      branch: "feature/test",
      checkout_path: "/worktrees/repo/feature-test",
      repo_root: "/repo",
    },
    ...overrides,
  };
}

describe("parseGitWorktreePorcelain", () => {
  it("extracts paths and local branch names", () => {
    const porcelain = [
      "worktree /repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /worktrees/repo/feature-test",
      "HEAD def456",
      "branch refs/heads/feature/test",
      "",
    ].join("\n");

    expect(parseGitWorktreePorcelain(porcelain)).toEqual([
      { path: "/repo", branch: "main" },
      { path: "/worktrees/repo/feature-test", branch: "feature/test" },
    ]);
  });
});

describe("parseGitBranchLines", () => {
  it("drops blank lines and remote HEAD pointers", () => {
    expect(parseGitBranchLines("main\norigin/main\norigin/HEAD\n\n")).toEqual([
      "main",
      "origin/main",
    ]);
  });
});

describe("buildWorktreeCandidates", () => {
  it("orders existing workspaces, worktrees, local branches, then remote branches", () => {
    const candidates = buildWorktreeCandidates({
      project: "/repo",
      workspaces: [worktreeWorkspace()],
      gitWorktrees: [
        {
          path: "/worktrees/repo/bug-fix",
          branch: "bug/fix",
        },
      ],
      gitBranches: {
        local: ["feature/test", "feature/new"],
        remote: ["origin/feature/new", "origin/feature/remote"],
      },
    });

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      "workspace",
      "worktree",
      "local-branch",
      "remote-branch",
    ]);
    expect(candidates.map((candidate) => candidate.branch)).toEqual([
      "feature/test",
      "bug/fix",
      "feature/new",
      "feature/remote",
    ]);
  });

  it("matches worktree workspaces by repo workspace id", () => {
    const candidates = buildWorktreeCandidates({
      project: "/other-path",
      repoWorkspaceId: "repo-ws",
      workspaces: [
        worktreeWorkspace({
          worktree: {
            branch: "feature/test",
            repo_workspace_id: "repo-ws",
            checkout_path: "/worktrees/repo/feature-test",
          },
        }),
      ],
      gitWorktrees: [],
      gitBranches: { local: [], remote: [] },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: "workspace",
      workspaceId: "ws-feature",
      branch: "feature/test",
    });
  });
});

describe("discoverWorktreeCandidates", () => {
  it("uses the injected runtime and can round-trip picker rows", async () => {
    const candidates = await discoverWorktreeCandidates({
      project: "/repo",
      workspaces: [],
      runtime: {
        listGitWorktrees: mock(async () => []),
        listGitBranches: mock(async () => ({
          local: ["feature/local"],
          remote: [],
        })),
      },
    });

    const row = worktreeCandidateRow(candidates[0]!);
    expect(worktreeCandidateFromRow(row, candidates)).toEqual(candidates[0]);
  });
});

describe("worktreeCandidateRow", () => {
  it("does not show existing checkout paths in picker rows", () => {
    const row = worktreeCandidateRow({
      id: "worktree:feature/test:/worktrees/repo/feature-test",
      kind: "worktree",
      label: "existing checkout   feature/test",
      branch: "feature/test",
      path: "/worktrees/repo/feature-test",
    });

    expect(row).toBe(
      [
        "worktree:feature/test:/worktrees/repo/feature-test",
        "existing checkout   feature/test",
        "",
      ].join("\t")
    );
  });
});
