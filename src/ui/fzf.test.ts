import { describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  pickOrCreate,
  pickOrCreateFromFzfStdout,
  promptQuery,
  queryFromFzfStdout,
} from "./fzf.ts";

describe("queryFromFzfStdout", () => {
  it("returns the first line trimmed (print-query)", () => {
    expect(queryFromFzfStdout("  feature/foo  \nfeature/foo\n")).toBe(
      "feature/foo"
    );
  });

  it("returns empty string for empty submit (not cancel)", () => {
    expect(queryFromFzfStdout("\n")).toBe("");
    expect(queryFromFzfStdout("")).toBe("");
  });
});

describe("promptQuery", () => {
  it("returns null when fzf aborts (Esc / exit 130)", async () => {
    const bin = fakeFzfScript("exit 130");
    await expect(promptQuery({ bin, prompt: "Branch name: " })).resolves.toBe(
      null
    );
  });

  it("returns null when fzf exits 1 (cancel)", async () => {
    const bin = fakeFzfScript("exit 1");
    await expect(promptQuery({ bin })).resolves.toBe(null);
  });

  it("returns the query on successful accept", async () => {
    const bin = fakeFzfScript('printf "%s\\n" "feature/foo"; exit 0');
    await expect(promptQuery({ bin })).resolves.toBe("feature/foo");
  });

  it("returns empty string when accept has an empty query", async () => {
    const bin = fakeFzfScript('printf "\\n"; exit 0');
    await expect(promptQuery({ bin })).resolves.toBe("");
  });
});

// Output shapes below were captured from fzf 0.74 driven through a real tty.
describe("pickOrCreateFromFzfStdout", () => {
  it("returns the row on Enter over a match", () => {
    expect(pickOrCreateFromFzfStdout("al\n\nalpha\n", "ctrl-n")).toEqual({
      kind: "row",
      row: "alpha",
    });
  });

  it("creates from the query on Enter with no match", () => {
    expect(pickOrCreateFromFzfStdout("zzz\n", "ctrl-n")).toEqual({
      kind: "create",
      query: "zzz",
    });
  });

  it("creates from the query on the create key, match or not", () => {
    expect(pickOrCreateFromFzfStdout("al\nctrl-n\nalpha\n", "ctrl-n")).toEqual({
      kind: "create",
      query: "al",
    });
    expect(pickOrCreateFromFzfStdout("zzz\nctrl-n\n", "ctrl-n")).toEqual({
      kind: "create",
      query: "zzz",
    });
  });

  it("returns null for an empty query with nothing picked", () => {
    expect(pickOrCreateFromFzfStdout("\n", "ctrl-n")).toBeNull();
    expect(pickOrCreateFromFzfStdout("  \nctrl-n\n", "ctrl-n")).toBeNull();
  });
});

describe("pickOrCreate", () => {
  it("returns null on Esc even though fzf printed the query", async () => {
    const bin = fakeFzfScript('printf "zzz\\n"; exit 130');
    await expect(
      pickOrCreate(["alpha"], { bin, createKey: "ctrl-n" })
    ).resolves.toBe(null);
  });

  it("creates on the create key with no match (fzf exits 1)", async () => {
    const bin = fakeFzfScript('printf "zzz\\nctrl-n\\n"; exit 1');
    await expect(
      pickOrCreate(["alpha"], { bin, createKey: "ctrl-n" })
    ).resolves.toEqual({ kind: "create", query: "zzz" });
  });
});

function fakeFzfScript(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sessionizer-fzf-"));
  const path = join(dir, "fzf");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}
