import { describe, expect, it, mock } from "bun:test";

import type { Herdr } from "../client/herdr.ts";
import { Panes } from "./panes.ts";

describe("Panes", () => {
  it("passes --ratio to herdr when a split ratio is provided", async () => {
    const herdr = {
      json: mock(async (args: readonly string[]) => ({
        result: {
          pane: {
            pane_id: "ws1-2",
            terminal_id: "term-2",
            workspace_id: "ws1",
            tab_id: "ws1:t1",
          },
        },
      })),
    } as unknown as Herdr;

    const panes = new Panes(herdr);

    await panes.split("ws1-1", {
      direction: "right",
      ratio: 0.3,
      cwd: "/tmp/project",
      focus: true,
    });

    expect(herdr.json).toHaveBeenCalledWith([
      "pane",
      "split",
      "ws1-1",
      "--direction",
      "right",
      "--ratio",
      "0.3",
      "--cwd",
      "/tmp/project",
      "--focus",
    ]);
  });

  it("omits --ratio when a split ratio is not provided", async () => {
    const herdr = {
      json: mock(async (_args: readonly string[]) => ({
        result: {
          pane: {
            pane_id: "ws1-2",
            terminal_id: "term-2",
            workspace_id: "ws1",
            tab_id: "ws1:t1",
          },
        },
      })),
    } as unknown as Herdr;

    const panes = new Panes(herdr);

    await panes.split("ws1-1", {
      direction: "down",
      cwd: "/tmp/project",
      focus: false,
    });

    expect(herdr.json).toHaveBeenCalledWith([
      "pane",
      "split",
      "ws1-1",
      "--direction",
      "down",
      "--cwd",
      "/tmp/project",
      "--no-focus",
    ]);
  });
});
