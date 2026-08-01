import { describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { promptQuery, queryFromFzfStdout } from "./fzf.ts";

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

function fakeFzfScript(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sessionizer-fzf-"));
  const path = join(dir, "fzf");
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}
