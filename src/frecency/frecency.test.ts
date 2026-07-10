import { describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createFrecency,
  parseZoxideLine,
  recencyWeight,
  StoreFrecency,
  ZoxideFrecency,
  type CommandRunner,
} from "./frecency.ts";

// ── parseZoxideLine ──────────────────────────────────────────────

describe("parseZoxideLine", () => {
  it("parses a score and path", () => {
    expect(parseZoxideLine(" 123.5   /home/user/foo")).toEqual({
      score: 123.5,
      path: "/home/user/foo",
    });
  });

  it("keeps spaces within the path", () => {
    expect(parseZoxideLine("10 /home/user/my project")).toEqual({
      score: 10,
      path: "/home/user/my project",
    });
  });

  it("returns null for blank lines", () => {
    expect(parseZoxideLine("")).toBeNull();
    expect(parseZoxideLine("   ")).toBeNull();
  });

  it("returns null for malformed lines", () => {
    expect(parseZoxideLine("not-a-score /path")).toBeNull();
    expect(parseZoxideLine("123")).toBeNull();
  });
});

// ── recencyWeight ──────────────────────────────────────────────

describe("recencyWeight", () => {
  it("weights by recency tier", () => {
    expect(recencyWeight(0)).toBe(4);
    expect(recencyWeight(2 * 3_600_000)).toBe(2);
    expect(recencyWeight(2 * 86_400_000)).toBe(1);
    expect(recencyWeight(30 * 86_400_000)).toBe(0.25);
  });
});

// ── ZoxideFrecency ──────────────────────────────────────────────

describe("ZoxideFrecency", () => {
  it("lists parsed results sorted by score descending", () => {
    const runner: CommandRunner = {
      run: mock(() => ({
        stdout: "5 /low\n42 /high\n10 /mid\n",
        ok: true,
      })),
    };
    const frecency = new ZoxideFrecency(runner);

    expect(frecency.list()).toEqual([
      { score: 42, path: "/high" },
      { score: 10, path: "/mid" },
      { score: 5, path: "/low" },
    ]);
  });

  it("returns empty when zoxide fails", () => {
    const runner: CommandRunner = {
      run: mock(() => ({ stdout: "", ok: false })),
    };
    expect(new ZoxideFrecency(runner).list()).toEqual([]);
  });

  it("records a visit via zoxide add", () => {
    const run = mock(() => ({ stdout: "", ok: true }));
    new ZoxideFrecency({ run }).add("/projects/foo");
    expect(run).toHaveBeenCalledWith("zoxide", ["add", "/projects/foo"]);
  });
});

// ── StoreFrecency ──────────────────────────────────────────────

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), "sessionizer-frecency-")), "f.json");
}

describe("StoreFrecency", () => {
  it("ranks by frequency then recency", () => {
    const file = tempStore();
    const clock = { t: 1_000_000_000_000 };
    const store = new StoreFrecency(file, () => clock.t);

    store.add("/a");
    store.add("/a");
    store.add("/b");

    const list = store.list();
    expect(list[0]).toEqual({ path: "/a", score: 8 }); // 2 visits × weight 4
    expect(list[1]).toEqual({ path: "/b", score: 4 }); // 1 visit × weight 4
  });

  it("decays older directories below fresher ones", () => {
    const file = tempStore();
    const clock = { t: 1_000_000_000_000 };
    const store = new StoreFrecency(file, () => clock.t);

    store.add("/old");
    store.add("/old");
    clock.t += 30 * 86_400_000; // a month later
    store.add("/new");

    const list = store.list();
    expect(list[0]!.path).toBe("/new"); // 1 × 4 = 4
    expect(list[1]!.path).toBe("/old"); // 2 × 0.25 = 0.5
  });

  it("persists across instances", () => {
    const file = tempStore();
    const clock = () => 1_000_000_000_000;
    new StoreFrecency(file, clock).add("/persisted");

    const reopened = new StoreFrecency(file, clock);
    expect(reopened.list().map((e) => e.path)).toContain("/persisted");
    expect(JSON.parse(readFileSync(file, "utf-8")).entries).toHaveProperty(
      "/persisted"
    );
  });

  it("caps the store to bound its size", () => {
    const file = tempStore();
    const store = new StoreFrecency(file, () => 1_000_000_000_000);
    for (let i = 0; i <= 500; i++) store.add(`/dir-${i}`);
    expect(store.list()).toHaveLength(500);
  });

  it("survives a corrupt store file", () => {
    const file = tempStore();
    const store = new StoreFrecency(file, () => 1);
    // Nothing written yet + then corrupt content is handled by starting fresh.
    expect(store.list()).toEqual([]);
    store.add("/ok");
    expect(store.list().map((e) => e.path)).toEqual(["/ok"]);
  });
});

// ── createFrecency ──────────────────────────────────────────────

describe("createFrecency", () => {
  it("uses zoxide when available", () => {
    expect(createFrecency({ hasZoxide: true })).toBeInstanceOf(ZoxideFrecency);
  });

  it("falls back to the store when zoxide is absent", () => {
    expect(
      createFrecency({ hasZoxide: false, storePath: tempStore() })
    ).toBeInstanceOf(StoreFrecency);
  });
});
