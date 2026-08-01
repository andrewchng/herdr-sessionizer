import { describe, expect, it } from "bun:test";
import { PassThrough } from "node:stream";

import { promptText } from "./prompt.ts";

describe("promptText", () => {
  it("returns trimmed input from a non-TTY line reader", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const result = promptText("Branch name: ", {
      input: input as unknown as NodeJS.ReadStream,
      output,
    });

    input.write("  feature/foo  \n");
    await expect(result).resolves.toBe("feature/foo");
  });

  it("returns empty string for empty submit (not cancel)", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const result = promptText("Branch name: ", {
      input: input as unknown as NodeJS.ReadStream,
      output,
    });

    input.write("\n");
    await expect(result).resolves.toBe("");
  });
});
