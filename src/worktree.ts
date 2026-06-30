import { listProjects } from "./discovery.ts";

import { Herdr } from "./client/herdr.ts";
import { loadConfig } from "./config.ts";
import { createProjectLayout } from "./layouts/project.ts";
import { Panes } from "./ops/panes.ts";
import { Tabs } from "./ops/tabs.ts";
import { Workspaces } from "./ops/workspaces.ts";
import { Worktrees } from "./ops/worktrees.ts";
import { pick } from "./ui/fzf.ts";
import { promptText } from "./ui/prompt.ts";
import { attachExistingBranchWorktree } from "./worktree-branch-fallback.ts";
import {
  defaultDiscoverWorktreeCandidates,
  runWorktreeFlow,
  type WorktreeFlowRuntime,
} from "./worktree-flow.ts";
import { WorktreeResolver } from "./worktree-resolver.ts";

export async function runWorktree(
  argv: readonly string[] = process.argv.slice(2),
  runtime: WorktreeFlowRuntime = createRuntime()
): Promise<void> {
  await runWorktreeFlow(argv, runtime);
}

async function promptBranchName(): Promise<string> {
  while (true) {
    const value = await promptText("Branch name: ");
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
    logger: console,
    exit: (code) => process.exit(code),
  };
}
