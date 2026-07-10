import { describe, expect, it } from "bun:test";

import type { Workspace } from "../client/types.ts";
import {
  buildFindArgv,
  candidateDisplay,
  candidateFromRow,
  candidateRow,
  directoryCandidate,
  isRowEncodable,
  mergeCandidates,
  openCandidates,
  workspaceIdFromKey,
  workspacePath,
  type Candidate,
} from "./candidates.ts";

// ── openCandidates ──────────────────────────────────────────────

describe("openCandidates", () => {
  it("maps workspace fields into candidates", () => {
    const workspace: Workspace = {
      workspace_id: "ws1",
      label: "app",
      cwd: "/projects/app",
      tab_count: 2,
      pane_count: 3,
      worktree: { branch: "main" },
    };

    expect(openCandidates([workspace])).toEqual([
      {
        kind: "workspace",
        key: "ws:ws1",
        name: "app",
        path: "/projects/app",
        source: "open",
        branch: "main",
        tabs: 2,
        panes: 3,
      },
    ]);
  });

  it("falls back to basename then id for the name", () => {
    expect(
      openCandidates([{ workspace_id: "ws2", cwd: "/a/b" }])[0]!.name
    ).toBe("b");
    expect(openCandidates([{ workspace_id: "ws3" }])[0]!.name).toBe("ws3");
  });
});

// ── workspacePath ──────────────────────────────────────────────

describe("workspacePath", () => {
  it("prefers cwd, then worktree metadata", () => {
    expect(workspacePath({ workspace_id: "w", cwd: "/x" })).toBe("/x");
    expect(
      workspacePath({
        workspace_id: "w",
        worktree: { checkout_path: "/co" },
      })
    ).toBe("/co");
    expect(workspacePath({ workspace_id: "w" })).toBe("");
  });
});

// ── row codec ──────────────────────────────────────────────

describe("candidate row codec", () => {
  it("round-trips a directory candidate through the key", () => {
    const candidate = directoryCandidate("/projects/with space", "recent", 12);
    const decoded = candidateFromRow(candidateRow(candidate));
    expect(decoded.kind).toBe("directory");
    expect(decoded.key).toBe("dir:/projects/with space");
    expect(decoded.path).toBe("/projects/with space");
    expect(decoded.source).toBe("recent");
  });

  it("round-trips an open workspace candidate", () => {
    const [candidate] = openCandidates([
      {
        workspace_id: "ws1",
        label: "app",
        cwd: "/projects/app",
        tab_count: 2,
        pane_count: 3,
        worktree: { branch: "feature/x" },
      },
    ]);
    const decoded = candidateFromRow(candidateRow(candidate!));
    expect(decoded.kind).toBe("workspace");
    expect(decoded.key).toBe("ws:ws1");
    expect(decoded.path).toBe("/projects/app");
    expect(decoded.branch).toBe("feature/x");
    expect(decoded.tabs).toBe(2);
    expect(decoded.panes).toBe(3);
    expect(workspaceIdFromKey(decoded.key)).toBe("ws1");
  });

  it("uses a tab delimiter and stable column count", () => {
    const row = candidateRow(directoryCandidate("/x", "root"));
    expect(row.split("\t")).toHaveLength(7);
  });
});

// ── candidateDisplay ──────────────────────────────────────────────

describe("candidateDisplay", () => {
  it("includes name and path", () => {
    expect(candidateDisplay(directoryCandidate("/projects/foo", "root"))).toBe(
      "foo  /projects/foo"
    );
  });

  it("annotates the branch for worktree workspaces", () => {
    const [candidate] = openCandidates([
      {
        workspace_id: "w",
        label: "app",
        cwd: "/a/app",
        worktree: { branch: "dev" },
      },
    ]);
    expect(candidateDisplay(candidate!)).toBe("app (dev)  /a/app");
  });
});

// ── mergeCandidates ──────────────────────────────────────────────

describe("mergeCandidates", () => {
  const dir = (path: string, source: Candidate["source"]) =>
    directoryCandidate(path, source);

  it("dedups a directory already backed by an open workspace", () => {
    const open = openCandidates([
      { workspace_id: "ws1", cwd: "/projects/app" },
    ]);
    const merged = mergeCandidates([open, [dir("/projects/app", "recent")]]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.kind).toBe("workspace");
  });

  it("keeps the highest-priority source and preserves order", () => {
    const merged = mergeCandidates([
      [dir("/a", "recent")],
      [dir("/a", "current"), dir("/b", "current")],
      [dir("/c", "root")],
    ]);
    expect(merged.map((c) => c.path)).toEqual(["/a", "/b", "/c"]);
    expect(merged.find((c) => c.path === "/a")!.source).toBe("recent");
  });

  it("normalizes trailing slashes when deduping", () => {
    const merged = mergeCandidates([
      [dir("/a", "recent")],
      [dir("/a/", "current")],
    ]);
    expect(merged).toHaveLength(1);
  });

  it("keeps two distinct open workspaces that share a path", () => {
    const open = openCandidates([
      { workspace_id: "ws1", cwd: "/projects/app" },
      { workspace_id: "ws2", cwd: "/projects/app" },
    ]);
    const merged = mergeCandidates([open, [dir("/projects/app", "recent")]]);
    expect(merged.filter((c) => c.kind === "workspace")).toHaveLength(2);
    expect(merged.some((c) => c.kind === "directory")).toBe(false);
  });
});

// ── isRowEncodable ──────────────────────────────────────────────

describe("isRowEncodable", () => {
  it("rejects directories whose path contains the delimiter or a newline", () => {
    expect(isRowEncodable(directoryCandidate("/a\tb", "find"))).toBe(false);
    expect(isRowEncodable(directoryCandidate("/a\nb", "find"))).toBe(false);
  });

  it("accepts ordinary directory paths", () => {
    expect(isRowEncodable(directoryCandidate("/a/b c", "root"))).toBe(true);
  });

  it("always accepts workspaces (selection resolves via the key)", () => {
    const [ws] = openCandidates([{ workspace_id: "w", cwd: "/a\tb" }]);
    expect(isRowEncodable(ws!)).toBe(true);
  });
});

// ── buildFindArgv ──────────────────────────────────────────────

describe("buildFindArgv", () => {
  it("builds an fd command with depth and excludes", () => {
    const argv = buildFindArgv({ roots: ["/home/u"], depth: 2 }, true);
    expect(argv[0]).toBe("fd");
    expect(argv).toContain("--max-depth");
    expect(argv[argv.indexOf("--max-depth") + 1]).toBe("2");
    expect(argv).toContain("--exclude");
    expect(argv).toContain("/home/u");
  });

  it("falls back to POSIX find without fd", () => {
    const argv = buildFindArgv({ roots: ["/home/u"], depth: 3 }, false);
    expect(argv[0]).toBe("find");
    expect(argv).toContain("-maxdepth");
    expect(argv[argv.indexOf("-maxdepth") + 1]).toBe("3");
    expect(argv).toContain("/home/u");
  });
});
