import { describe, expect, it } from "bun:test";
import { fzfMissingMessage, resolveFzfBin } from "./prerequisites.ts";

describe("resolveFzfBin", () => {
  it("returns an explicit bin override without checking PATH", () => {
    expect(resolveFzfBin("/custom/fzf")).toBe("/custom/fzf");
  });

  it("throws a helpful message when fzf is missing from PATH", () => {
    expect(() => resolveFzfBin(undefined, () => null)).toThrow(
      fzfMissingMessage()
    );
  });
});
