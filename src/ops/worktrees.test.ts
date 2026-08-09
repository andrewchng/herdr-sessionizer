import { describe, expect, it, mock } from "bun:test";

import type { Herdr } from "../client/herdr.ts";
import type { Workspace } from "../client/types.ts";
import { Worktrees } from "./worktrees.ts";

function workspace(): Workspace {
  return {
    workspace_id: "ws-feature",
    cwd: "/worktrees/repo/feature-test-flow",
    tab_count: 1,
    pane_count: 1,
    worktree: {
      checkout_path: "/worktrees/repo/feature-test-flow",
    },
  };
}

function herdrWithResult(result: Record<string, unknown>): Herdr {
  return {
    json: mock(async (_args: readonly string[]) => ({ result })),
  } as unknown as Herdr;
}

describe("Worktrees.open", () => {
  it("maps already_open false to alreadyOpen false for a fresh open", async () => {
    const herdr = herdrWithResult({
      workspace: workspace(),
      already_open: false,
      worktree: { checkout_path: "/worktrees/repo/feature-test-flow" },
    });

    const opened = await new Worktrees(herdr).open({
      cwd: "/repo",
      branch: "feature/test-flow",
      focus: true,
    });

    expect(opened.alreadyOpen).toBe(false);
    expect(opened.workspace?.workspace_id).toBe("ws-feature");
    expect(opened.worktreePath).toBe("/worktrees/repo/feature-test-flow");
  });

  it("maps already_open true to alreadyOpen true when herdr refocuses an open workspace", async () => {
    const herdr = herdrWithResult({
      workspace: workspace(),
      already_open: true,
    });

    const opened = await new Worktrees(herdr).open({
      cwd: "/repo",
      branch: "feature/test-flow",
      focus: true,
    });

    expect(opened.alreadyOpen).toBe(true);
    expect(opened.workspace?.workspace_id).toBe("ws-feature");
  });
});
