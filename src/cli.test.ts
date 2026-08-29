import { describe, expect, it, mock } from "bun:test";

import { isMode, main, parseArgs, usage, type Mode } from "./cli.ts";

describe("parseArgs", () => {
  it("returns help for no args, --help, and -h", () => {
    expect(parseArgs([])).toEqual({ ok: true, kind: "help" });
    expect(parseArgs(["--help"])).toEqual({ ok: true, kind: "help" });
    expect(parseArgs(["-h"])).toEqual({ ok: true, kind: "help" });
  });

  it("parses each known mode and forwards remaining args", () => {
    const modes: Mode[] = ["open", "sessionizer", "worktree-open", "worktree"];
    for (const mode of modes) {
      expect(parseArgs([mode])).toEqual({
        ok: true,
        kind: "run",
        mode,
        args: [],
      });
      expect(parseArgs([mode, "--project", "/repo"])).toEqual({
        ok: true,
        kind: "run",
        mode,
        args: ["--project", "/repo"],
      });
    }
  });

  it("rejects unknown modes", () => {
    expect(parseArgs(["nope"])).toEqual({
      ok: false,
      error: "Unknown mode: nope",
    });
  });
});

describe("isMode", () => {
  it("accepts only the four plugin modes", () => {
    expect(isMode("open")).toBe(true);
    expect(isMode("sessionizer")).toBe(true);
    expect(isMode("worktree-open")).toBe(true);
    expect(isMode("worktree")).toBe(true);
    expect(isMode("help")).toBe(false);
    expect(isMode("")).toBe(false);
  });
});

describe("usage", () => {
  it("lists all four modes", () => {
    const text = usage();
    expect(text).toContain("open");
    expect(text).toContain("sessionizer");
    expect(text).toContain("worktree-open");
    expect(text).toContain("worktree");
  });
});

describe("main", () => {
  it("prints usage and exits 0 for help", async () => {
    const log = mock(() => {});
    const error = mock(() => {});
    const originalLog = console.log;
    const originalError = console.error;
    console.log = log;
    console.error = error;

    try {
      expect(await main([])).toBe(0);
      expect(await main(["--help"])).toBe(0);
      expect(log).toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });

  it("prints usage and exits non-zero for unknown mode", async () => {
    const log = mock(() => {});
    const error = mock(() => {});
    const originalLog = console.log;
    const originalError = console.error;
    console.log = log;
    console.error = error;

    try {
      expect(await main(["not-a-mode"])).toBe(1);
      expect(error).toHaveBeenCalled();
      const joined = error.mock.calls
        .map((c) => (c as unknown[]).map(String).join(" "))
        .join("\n");
      expect(joined).toContain("Unknown mode");
      expect(joined).toContain("Usage:");
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  });
});
