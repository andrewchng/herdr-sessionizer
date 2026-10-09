import { describe, expect, it } from "bun:test";

import type { Workspace } from "../client/types.ts";
import {
  extractWorkspaceId,
  workspaceRow,
  WORKSPACE_ROW_DELIMITER,
} from "./workspace-row.ts";

function testWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    workspace_id: "ws-feature",
    label: "feature/test-flow",
    cwd: "/worktrees/repo/feature-test-flow",
    tab_count: 2,
    pane_count: 1,
    ...overrides,
  };
}

describe("workspaceRow", () => {
  it("renders id, label, summary, cwd, branch, repo_name, provenance, tabs, panes", () => {
    const row = workspaceRow(
      testWorkspace({
        worktree: {
          branch: "feature/test-flow",
          repo_name: "repo",
          checkout_path: "/worktrees/repo/feature-test-flow",
          is_linked_worktree: true,
        },
      })
    );

    expect(row.split(WORKSPACE_ROW_DELIMITER)).toEqual([
      "ws-feature",
      "repo / feature/test-flow",
      "feature/test-flow · feature-test-flow",
      "/worktrees/repo/feature-test-flow",
      "feature/test-flow",
      "repo",
      "worktree",
      "2",
      "1",
    ]);
  });

  it("populates repo_name from worktree provenance and is empty otherwise", () => {
    const withRepo = workspaceRow(
      testWorkspace({ worktree: { repo_name: "repo" } })
    );
    const withoutRepo = workspaceRow(testWorkspace());

    expect(withRepo.split(WORKSPACE_ROW_DELIMITER)[5]).toBe("repo");
    expect(withoutRepo.split(WORKSPACE_ROW_DELIMITER)[5]).toBe("");
  });

  it("marks provenance as worktree only for linked worktrees, project otherwise", () => {
    const worktreeRow = workspaceRow(
      testWorkspace({
        worktree: { repo_name: "repo", is_linked_worktree: true },
      })
    );
    const parentRow = workspaceRow(
      // Parent repo carries provenance but is not itself a linked worktree.
      testWorkspace({
        worktree: { repo_name: "repo", is_linked_worktree: false },
      })
    );
    const projectRow = workspaceRow(testWorkspace());

    expect(worktreeRow.split(WORKSPACE_ROW_DELIMITER)[6]).toBe("worktree");
    expect(parentRow.split(WORKSPACE_ROW_DELIMITER)[6]).toBe("project");
    expect(projectRow.split(WORKSPACE_ROW_DELIMITER)[6]).toBe("project");
  });

  it("sanitizes fields containing tabs or newlines", () => {
    const row = workspaceRow(
      testWorkspace({
        label: "a\tb",
        worktree: {
          branch: "x\ny",
          repo_name: "repo",
        },
      })
    );
    const columns = row.split(WORKSPACE_ROW_DELIMITER);

    expect(columns[1]).toBe("a b");
    expect(columns[4]).toBe("x y");
  });

  it("uses the workspace id as the label fallback when no path or label is set", () => {
    const row = workspaceRow(
      testWorkspace({ label: undefined, cwd: undefined })
    );

    expect(row.split(WORKSPACE_ROW_DELIMITER)[1]).toBe("ws-feature");
  });
});

describe("extractWorkspaceId", () => {
  it("returns the first column regardless of trailing columns", () => {
    expect(
      extractWorkspaceId(
        "ws-1\tlabel\tsummary\tcwd\tbranch\trepo\tworktree\t2\t1"
      )
    ).toBe("ws-1");
  });

  it("returns the whole row when there is no delimiter", () => {
    expect(extractWorkspaceId("ws-1")).toBe("ws-1");
  });
});
