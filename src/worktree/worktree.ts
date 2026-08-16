import { listProjects } from "../discovery/discovery.ts";

import { Herdr } from "../client/herdr.ts";
import { loadConfig } from "../config/config.ts";
import { createProjectLayout } from "../layouts/project.ts";
import { Panes } from "../ops/panes.ts";
import { Tabs } from "../ops/tabs.ts";
import { Workspaces } from "../ops/workspaces.ts";
import { Worktrees } from "../ops/worktrees.ts";
import { pick, promptQuery } from "../ui/fzf.ts";
import {
  attachExistingBranchWorktree,
  localBranchExists,
} from "./branch-fallback.ts";
import { fetchPullRequestHead } from "./candidates.ts";
import {
  defaultDiscoverWorktreeCandidates,
  runWorktreeFlow,
  type WorktreeFlowRuntime,
} from "./flow.ts";
import { WorktreeResolver } from "./resolver.ts";

export async function runWorktree(
  argv: readonly string[] = process.argv.slice(2),
  runtime: WorktreeFlowRuntime = createRuntime()
): Promise<void> {
  await runWorktreeFlow(argv, runtime);
}

async function promptBranchName(): Promise<string | null> {
  while (true) {
    // Use fzf free-text (not raw-mode readline) so Esc cancels the same way
    // as the project/candidate pickers and the Herdr plugin pane exits.
    const value = await promptQuery({
      prompt: "Branch name: ",
      header: "Type a branch name · Enter create · Esc cancel",
    });
    if (value === null) return null;
    if (!value) {
      console.error("Branch name cannot be empty.");
      continue;
    }
    if (/\s/.test(value)) {
      console.error("Branch name cannot contain spaces.");
      continue;
    }
    return value;
  }
}

function createRuntime(): WorktreeFlowRuntime {
  const herdr = new Herdr();

  return {
    worktrees: new Worktrees(herdr),
    workspaces: new Workspaces(herdr),
    tabs: new Tabs(herdr),
    panes: new Panes(herdr),
    config: loadConfig(),
    resolver: new WorktreeResolver(),
    createLayout: (workspace, cwd, config, tabs, panes, options) =>
      createProjectLayout(
        workspace,
        cwd,
        config,
        tabs as Tabs,
        panes as Panes,
        options
      ),
    listProjects,
    pickProject: pick,
    pickWorktreeCandidate: pick,
    promptBranch: promptBranchName,
    discoverCandidates: defaultDiscoverWorktreeCandidates,
    attachExistingBranch: attachExistingBranchWorktree,
    localBranchExists,
    fetchPullRequestHead,
    logger: console,
    exit: (code) => process.exit(code),
  };
}
