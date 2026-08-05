import { describe, expect, it, mock } from "bun:test";

import type { Workspace } from "../client/types.ts";
import {
  buildWorktreeCandidates,
  discoverWorktreeCandidates,
  openPullRequestLabel,
  parseGitBranchLines,
  parseGitWorktreePorcelain,
  parseOpenPullRequests,
  pullRequestBranchName,
  worktreeCandidateFromRow,
  worktreeCandidatePreviewPath,
  worktreeCandidateRow,
  worktreeCandidateVisibleRow,
} from "./candidates.ts";

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

describe("parseOpenPullRequests", () => {
  it("parses gh pr list JSON including drafts and cross-fork heads", () => {
    const json = JSON.stringify([
      {
        number: 29,
        title: "fix(worktree): gate branch fallback",
        headRefName: "fix/branch-exists-check",
        headRepositoryOwner: { login: "pperanich" },
        author: { login: "pperanich" },
        isDraft: true,
        isCrossRepository: true,
      },
      {
        number: 30,
        title: "docs: update readme",
        headRefName: "docs/readme",
        headRepositoryOwner: { login: "andrewchng" },
        isDraft: false,
        isCrossRepository: false,
      },
    ]);

    expect(parseOpenPullRequests(json)).toEqual([
      {
        number: 29,
        title: "fix(worktree): gate branch fallback",
        headRefName: "fix/branch-exists-check",
        headOwner: "pperanich",
        isDraft: true,
        isCrossRepository: true,
      },
      {
        number: 30,
        title: "docs: update readme",
        headRefName: "docs/readme",
        headOwner: "andrewchng",
        isDraft: false,
        isCrossRepository: false,
      },
    ]);
  });

  it("returns empty for invalid JSON", () => {
    expect(parseOpenPullRequests("not-json")).toEqual([]);
  });
});

describe("buildWorktreeCandidates", () => {
  it("orders existing workspaces, worktrees, open PRs, local branches, then remote branches", () => {
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
      openPullRequests: [
        {
          number: 29,
          title: "fix(worktree): gate branch fallback",
          headRefName: "fix/branch-exists-check",
          headOwner: "pperanich",
        },
      ],
    });

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      "workspace",
      "worktree",
      "pull-request",
      "local-branch",
      "remote-branch",
    ]);
    expect(candidates.map((candidate) => candidate.branch)).toEqual([
      "feature/test",
      "bug/fix",
      "pr-29",
      "feature/new",
      "feature/remote",
    ]);
    expect(candidates[2]).toMatchObject({
      kind: "pull-request",
      id: "pr:29",
      prNumber: 29,
      label:
        "open pr  #29  fix(worktree): gate branch fallback  pperanich:fix/branch-exists-check",
      headOwner: "pperanich",
      headRefName: "fix/branch-exists-check",
      previewPath: "/repo",
    });
  });

  it("omits open PR rows when pr-N is already seen as workspace, checkout, or local branch", () => {
    const candidates = buildWorktreeCandidates({
      project: "/repo",
      workspaces: [
        worktreeWorkspace({
          workspace_id: "ws-pr-29",
          worktree: {
            branch: "pr-29",
            checkout_path: "/worktrees/repo/pr-29",
            repo_root: "/repo",
          },
        }),
      ],
      gitWorktrees: [],
      gitBranches: {
        local: ["pr-30"],
        remote: [],
      },
      openPullRequests: [
        {
          number: 29,
          title: "already opened as workspace",
          headRefName: "feature/a",
          headOwner: "alice",
        },
        {
          number: 30,
          title: "already a local branch",
          headRefName: "feature/b",
          headOwner: "bob",
        },
        {
          number: 31,
          title: "still open",
          headRefName: "feature/c",
          headOwner: "carol",
        },
      ],
    });

    expect(
      candidates
        .filter((candidate) => candidate.kind === "pull-request")
        .map((candidate) => candidate.branch)
    ).toEqual(["pr-31"]);
    expect(candidates.map((candidate) => candidate.branch)).toContain("pr-29");
    expect(candidates.map((candidate) => candidate.branch)).toContain("pr-30");
  });

  it("allows same-repo remote head rows alongside open PR rows", () => {
    const candidates = buildWorktreeCandidates({
      project: "/repo",
      workspaces: [],
      gitWorktrees: [],
      gitBranches: {
        local: [],
        remote: ["origin/fix/branch-exists-check"],
      },
      openPullRequests: [
        {
          number: 29,
          title: "fix(worktree): gate branch fallback",
          headRefName: "fix/branch-exists-check",
          headOwner: "pperanich",
        },
      ],
    });

    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      "pull-request",
      "remote-branch",
    ]);
    expect(candidates.map((candidate) => candidate.branch)).toEqual([
      "pr-29",
      "fix/branch-exists-check",
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
        listOpenPullRequests: mock(async () => []),
      },
    });

    const row = worktreeCandidateRow(candidates[0]!);
    expect(worktreeCandidateFromRow(row, candidates)).toEqual(candidates[0]);
  });

  it("merges injected open PRs and soft-skips when listOpenPullRequests throws", async () => {
    const withPrs = await discoverWorktreeCandidates({
      project: "/repo",
      workspaces: [],
      runtime: {
        listGitWorktrees: mock(async () => []),
        listGitBranches: mock(async () => ({ local: [], remote: [] })),
        listOpenPullRequests: mock(async () => [
          {
            number: 7,
            title: "draft ok",
            headRefName: "feature/draft",
            headOwner: "dev",
            isDraft: true,
          },
        ]),
      },
    });
    expect(withPrs).toHaveLength(1);
    expect(withPrs[0]).toMatchObject({
      kind: "pull-request",
      branch: "pr-7",
      prNumber: 7,
    });

    const skipped = await discoverWorktreeCandidates({
      project: "/repo",
      workspaces: [],
      runtime: {
        listGitWorktrees: mock(async () => []),
        listGitBranches: mock(async () => ({
          local: ["main"],
          remote: [],
        })),
        listOpenPullRequests: mock(async () => {
          throw new Error("gh missing");
        }),
      },
    });
    expect(skipped.map((candidate) => candidate.kind)).toEqual([
      "local-branch",
    ]);
  });
});

describe("pull request helpers", () => {
  it("names local branches pr-N and formats open PR labels", () => {
    expect(pullRequestBranchName(29)).toBe("pr-29");
    expect(
      openPullRequestLabel({
        number: 29,
        title: "fix\twith\nwhitespace",
        headRefName: "fix/branch",
        headOwner: "alice",
      })
    ).toBe("open pr  #29  fix with whitespace  alice:fix/branch");
  });
});

describe("worktreeCandidateRow", () => {
  it("keeps existing checkout paths in preview data, not visible row text", () => {
    const row = worktreeCandidateRow({
      id: "worktree:feature/test:/worktrees/repo/feature-test",
      kind: "worktree",
      label: "existing checkout   feature/test",
      branch: "feature/test",
      path: "/worktrees/repo/feature-test",
    });

    expect(worktreeCandidateVisibleRow(row)).toBe(
      "existing checkout   feature/test"
    );
    expect(worktreeCandidatePreviewPath(row)).toBe(
      "/worktrees/repo/feature-test"
    );
  });

  it("uses the base repo path as preview data for branch rows", () => {
    const candidates = buildWorktreeCandidates({
      project: "/repo",
      workspaces: [],
      gitWorktrees: [],
      gitBranches: { local: ["feature/test"], remote: [] },
    });
    const row = worktreeCandidateRow(candidates[0]!);

    expect(worktreeCandidateVisibleRow(row)).toBe(
      "local branch        feature/test"
    );
    expect(worktreeCandidatePreviewPath(row)).toBe("/repo");
  });

  it("includes PR fetch detail in the picker row metadata", () => {
    const row = worktreeCandidateRow({
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
    });

    expect(worktreeCandidateVisibleRow(row)).toBe(
      "open pr  #29  fix(worktree): gate branch fallback  pperanich:fix/branch-exists-check\tpr #29 → pr-29 | pull/29/head"
    );
    expect(worktreeCandidatePreviewPath(row)).toBe("/repo");
  });
});
