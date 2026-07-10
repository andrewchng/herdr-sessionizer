import { describe, expect, it } from "bun:test";

import type { SessionizerConfig } from "../config/config.ts";
import { buildRows, type RowDeps } from "./rows.ts";
import { candidateFromRow } from "./candidates.ts";

function cfg(overrides: Partial<SessionizerConfig> = {}): SessionizerConfig {
  return {
    projects: { roots: ["/roots"], git_only: false, depth: 1 },
    find: { roots: ["/home"], depth: 2 },
    current: { enabled: true, siblings: true, children: true },
    recent: { enabled: true, limit: 50 },
    layout: { placement: "overlay", focus: "x" },
    tabs: [],
    ...overrides,
  };
}

function deps(overrides: Partial<RowDeps> = {}): RowDeps {
  return {
    listWorkspaces: async () => [],
    frecency: { list: () => [], add: () => {} },
    listProjects: () => [],
    listCurrentDirectories: () => [],
    runFind: () => [],
    dirExists: () => true,
    ...overrides,
  };
}

const sources = (rows: string[]) => rows.map((r) => candidateFromRow(r).source);
const paths = (rows: string[]) => rows.map((r) => candidateFromRow(r).path);

describe("buildRows", () => {
  it("merges the default view in source order and dedups by path", async () => {
    const rows = await buildRows(
      "default",
      "/cwd",
      cfg(),
      deps({
        listWorkspaces: async () => [{ workspace_id: "w1", cwd: "/open" }],
        frecency: {
          list: () => [{ path: "/recent", score: 5 }],
          add: () => {},
        },
        listCurrentDirectories: () => ["/current"],
        listProjects: () => ["/root", "/open"], // /open duplicates the workspace
      })
    );
    expect(sources(rows)).toEqual(["open", "recent", "current", "root"]);
    // /open appears once (as the workspace), not again as a root directory.
    expect(paths(rows).filter((p) => p === "/open")).toHaveLength(1);
  });

  it("lists only workspaces for the open source", async () => {
    const rows = await buildRows(
      "open",
      "/cwd",
      cfg(),
      deps({ listWorkspaces: async () => [{ workspace_id: "w", cwd: "/a" }] })
    );
    expect(rows).toHaveLength(1);
    expect(candidateFromRow(rows[0]!).kind).toBe("workspace");
  });

  it("skips missing recent directories", async () => {
    const rows = await buildRows(
      "recent",
      "/cwd",
      cfg(),
      deps({
        frecency: {
          list: () => [
            { path: "/gone", score: 9 },
            { path: "/here", score: 1 },
          ],
          add: () => {},
        },
        dirExists: (p) => p === "/here",
      })
    );
    expect(paths(rows)).toEqual(["/here"]);
  });

  it("caps recent to the configured limit", async () => {
    const rows = await buildRows(
      "recent",
      "/cwd",
      cfg({ recent: { enabled: true, limit: 1 } }),
      deps({
        frecency: {
          list: () => [
            { path: "/a", score: 9 },
            { path: "/b", score: 8 },
          ],
          add: () => {},
        },
      })
    );
    expect(paths(rows)).toEqual(["/a"]);
  });

  it("omits the current source when disabled", async () => {
    const rows = await buildRows(
      "current",
      "/cwd",
      cfg({ current: { enabled: false, siblings: true, children: true } }),
      deps({ listCurrentDirectories: () => ["/x"] })
    );
    expect(rows).toEqual([]);
  });

  it("uses runFind for the find source", async () => {
    const rows = await buildRows(
      "find",
      "/cwd",
      cfg(),
      deps({ runFind: () => ["/deep/a", "/deep/b"] })
    );
    expect(paths(rows)).toEqual(["/deep/a", "/deep/b"]);
    expect(sources(rows).every((s) => s === "find")).toBe(true);
  });

  it("drops directories whose path cannot be encoded in a row", async () => {
    const rows = await buildRows(
      "find",
      "/cwd",
      cfg(),
      deps({ runFind: () => ["/ok", "/bad\tpath"] })
    );
    expect(paths(rows)).toEqual(["/ok"]);
  });
});
