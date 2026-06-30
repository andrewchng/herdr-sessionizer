import { describe, expect, it, mock } from "bun:test";

import type { SessionizerConfig } from "../config/config.ts";
import type { Pane, Tab, Workspace } from "../client/types.ts";
import {
  createProjectLayout,
  type LayoutPanes,
  type LayoutTabs,
} from "./project.ts";

function testConfig(overrides?: Partial<SessionizerConfig>): SessionizerConfig {
  return {
    projects: { roots: ["/tmp"] },
    layout: { placement: "overlay", focus: "assistant" },
    tabs: [
      {
        id: "terminal",
        label: "Terminal",
        panes: [
          { id: "root", title: "terminal", command: "" },
          {
            id: "assistant",
            from: "root",
            title: "assistant",
            split: "right",
            command: "kiro-cli",
            accept_command_override: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function testWorkspace(): Workspace {
  return { workspace_id: "ws1", tab_count: 1, pane_count: 1 };
}

describe("createProjectLayout", () => {
  it("continues through tab rename failures with the lenient error policy", async () => {
    const tabs: LayoutTabs = {
      create: mock(
        async (_options): Promise<Tab> => ({
          tab_id: "ws1:t2",
          workspace_id: "ws1",
        })
      ),
      rename: mock(async () => {
        throw new Error("rename failed");
      }),
      focus: mock(async () => {}),
    };
    const panes: LayoutPanes = {
      split: mock(
        async (): Promise<Pane> => ({
          pane_id: "ws1-2",
          terminal_id: "term-2",
          workspace_id: "ws1",
          tab_id: "ws1:t1",
        })
      ),
      run: mock(async () => {}),
      rename: mock(async () => {}),
    };

    await expect(
      createProjectLayout(
        testWorkspace(),
        "/tmp/project",
        testConfig(),
        tabs,
        panes,
        {
          commandOverride: 'kiro-cli chat "review change"',
          branch: "feat/test",
        }
      )
    ).resolves.toEqual(testWorkspace());

    expect(panes.rename).toHaveBeenCalledWith("ws1-1", "terminal");
    expect(panes.run).toHaveBeenCalledWith("ws1-1", "cd '/tmp/project'");
    expect(panes.rename).toHaveBeenCalledWith("ws1-2", "assistant");
    expect(panes.run).toHaveBeenCalledWith(
      "ws1-2",
      `cd '/tmp/project' && kiro-cli chat "review change"`
    );
    expect(tabs.focus).toHaveBeenCalledWith("ws1:1");
  });

  it("uses fallback pane ids when pane splitting fails", async () => {
    const tabs: LayoutTabs = {
      create: mock(
        async (_options): Promise<Tab> => ({
          tab_id: "ws1:t2",
          workspace_id: "ws1",
        })
      ),
      rename: mock(async () => {}),
      focus: mock(async () => {}),
    };
    const panes: LayoutPanes = {
      split: mock(async () => {
        throw new Error("split failed");
      }),
      run: mock(async () => {}),
      rename: mock(async () => {}),
    };

    await createProjectLayout(
      testWorkspace(),
      "/tmp/project",
      testConfig(),
      tabs,
      panes
    );

    expect(panes.rename).toHaveBeenCalledWith("ws1-2", "assistant");
    expect(panes.run).toHaveBeenCalledWith(
      "ws1-2",
      "cd '/tmp/project' && kiro-cli"
    );
  });

  it("passes pane ratios through to split creation", async () => {
    const tabs: LayoutTabs = {
      create: mock(
        async (_options): Promise<Tab> => ({
          tab_id: "ws1:t2",
          workspace_id: "ws1",
        })
      ),
      rename: mock(async () => {}),
      focus: mock(async () => {}),
    };
    const panes: LayoutPanes = {
      split: mock(
        async (): Promise<Pane> => ({
          pane_id: "ws1-2",
          terminal_id: "term-2",
          workspace_id: "ws1",
          tab_id: "ws1:t1",
        })
      ),
      run: mock(async () => {}),
      rename: mock(async () => {}),
    };

    await createProjectLayout(
      testWorkspace(),
      "/tmp/project",
      testConfig({
        tabs: [
          {
            id: "terminal",
            label: "Terminal",
            panes: [
              { id: "root", title: "terminal", command: "" },
              {
                id: "assistant",
                from: "root",
                title: "assistant",
                split: "right",
                ratio: 0.3,
                command: "kiro-cli",
              },
              {
                id: "logs",
                from: "assistant",
                title: "logs",
                split: "down",
                ratio: 0.25,
                command: "tail -f log.txt",
              },
            ],
          },
        ],
      }),
      tabs,
      panes
    );

    expect(panes.split).toHaveBeenNthCalledWith(1, "ws1-1", {
      direction: "right",
      ratio: 0.3,
      cwd: "/tmp/project",
      focus: true,
    });
    expect(panes.split).toHaveBeenNthCalledWith(2, "ws1-2", {
      direction: "down",
      ratio: 0.25,
      cwd: "/tmp/project",
      focus: false,
    });
  });

  it("uses each nested pane's own ratio for later splits", async () => {
    const tabs: LayoutTabs = {
      create: mock(
        async (_options): Promise<Tab> => ({
          tab_id: "ws1:t2",
          workspace_id: "ws1",
        })
      ),
      rename: mock(async () => {}),
      focus: mock(async () => {}),
    };
    const panes: LayoutPanes = {
      split: mock(
        async (): Promise<Pane> => ({
          pane_id: "ws1-2",
          terminal_id: "term-2",
          workspace_id: "ws1",
          tab_id: "ws1:t1",
        })
      ),
      run: mock(async () => {}),
      rename: mock(async () => {}),
    };

    await createProjectLayout(
      testWorkspace(),
      "/tmp/project",
      testConfig({
        tabs: [
          {
            id: "terminal",
            label: "Terminal",
            panes: [
              { id: "root", title: "terminal", command: "" },
              {
                id: "assistant",
                from: "root",
                title: "assistant",
                split: "right",
                ratio: 0.3,
                command: "kiro-cli",
              },
              {
                id: "scratch",
                from: "assistant",
                title: "scratch",
                split: "down",
                ratio: 0.4,
                command: "bash",
              },
            ],
          },
        ],
      }),
      tabs,
      panes
    );

    expect(panes.split).toHaveBeenNthCalledWith(1, "ws1-1", {
      direction: "right",
      ratio: 0.3,
      cwd: "/tmp/project",
      focus: true,
    });
    expect(panes.split).toHaveBeenNthCalledWith(2, "ws1-2", {
      direction: "down",
      ratio: 0.4,
      cwd: "/tmp/project",
      focus: false,
    });
  });

  it("leaves split ratio unset when a pane omits it", async () => {
    const tabs: LayoutTabs = {
      create: mock(
        async (_options): Promise<Tab> => ({
          tab_id: "ws1:t2",
          workspace_id: "ws1",
        })
      ),
      rename: mock(async () => {}),
      focus: mock(async () => {}),
    };
    const panes: LayoutPanes = {
      split: mock(
        async (): Promise<Pane> => ({
          pane_id: "ws1-2",
          terminal_id: "term-2",
          workspace_id: "ws1",
          tab_id: "ws1:t1",
        })
      ),
      run: mock(async () => {}),
      rename: mock(async () => {}),
    };

    await createProjectLayout(
      testWorkspace(),
      "/tmp/project",
      testConfig(),
      tabs,
      panes
    );

    expect(panes.split).toHaveBeenCalledWith("ws1-1", {
      direction: "right",
      ratio: undefined,
      cwd: "/tmp/project",
      focus: true,
    });
  });

  it("throws when command override is provided but no pane accepts it", async () => {
    await expect(
      createProjectLayout(
        testWorkspace(),
        "/tmp/project",
        testConfig({
          tabs: [
            {
              id: "terminal",
              label: "Terminal",
              panes: [
                { id: "root", title: "terminal", command: "" },
                {
                  id: "assistant",
                  from: "root",
                  title: "assistant",
                  split: "right",
                  command: "kiro-cli",
                },
              ],
            },
          ],
        }),
        {
          create: mock(
            async (_options): Promise<Tab> => ({
              tab_id: "ws1:t2",
              workspace_id: "ws1",
            })
          ),
          rename: mock(async () => {}),
          focus: mock(async () => {}),
        },
        {
          split: mock(
            async (): Promise<Pane> => ({
              pane_id: "ws1-2",
              terminal_id: "term-2",
              workspace_id: "ws1",
              tab_id: "ws1:t1",
            })
          ),
          run: mock(async () => {}),
          rename: mock(async () => {}),
        },
        { commandOverride: "echo hi" }
      )
    ).rejects.toThrow(
      "Worktree command override was provided, but no pane declares 'accept_command_override = true'."
    );
  });

  it("throws when multiple panes accept command override", async () => {
    await expect(
      createProjectLayout(
        testWorkspace(),
        "/tmp/project",
        testConfig({
          tabs: [
            {
              id: "terminal",
              label: "Terminal",
              panes: [
                {
                  id: "root",
                  title: "terminal",
                  command: "",
                  accept_command_override: true,
                },
                {
                  id: "assistant",
                  from: "root",
                  title: "assistant",
                  split: "right",
                  command: "kiro-cli",
                  accept_command_override: true,
                },
              ],
            },
          ],
        }),
        {
          create: mock(
            async (_options): Promise<Tab> => ({
              tab_id: "ws1:t2",
              workspace_id: "ws1",
            })
          ),
          rename: mock(async () => {}),
          focus: mock(async () => {}),
        },
        {
          split: mock(
            async (): Promise<Pane> => ({
              pane_id: "ws1-2",
              terminal_id: "term-2",
              workspace_id: "ws1",
              tab_id: "ws1:t1",
            })
          ),
          run: mock(async () => {}),
          rename: mock(async () => {}),
        },
        { commandOverride: "echo hi" }
      )
    ).rejects.toThrow(
      "Worktree command override requires exactly one pane target, but found 2: Terminal/root, Terminal/assistant"
    );
  });
});
