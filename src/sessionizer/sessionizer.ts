import { basename } from "node:path";

import { listProjects, sanitizeName } from "../discovery/discovery.ts";

import type { Workspace } from "../client/types.ts";
import { Herdr } from "../client/herdr.ts";
import type { SessionizerConfig } from "../config/config.ts";
import { loadConfig, resolveLayoutConfig } from "../config/config.ts";
import {
  createProjectLayout,
  type LayoutPanes,
  type LayoutTabs,
} from "../layouts/project.ts";
import { Panes } from "../ops/panes.ts";
import { Tabs } from "../ops/tabs.ts";
import { Workspaces } from "../ops/workspaces.ts";
import { pick, type PickOptions } from "../ui/fzf.ts";
import { PROJECT_PREVIEW, WORKSPACE_PREVIEW } from "../ui/previews.ts";

const WORKSPACE_ROW_DELIMITER = "\t";

type LayoutApplier = (
  workspace: Workspace,
  cwd: string,
  config: SessionizerConfig,
  tabs: LayoutTabs,
  panes: LayoutPanes
) => Promise<Workspace>;

interface SessionizerWorkspaceRuntime {
  list(): Promise<Workspace[]>;
  create(options: {
    cwd: string;
    label: string;
    focus?: boolean;
  }): Promise<Workspace>;
  focus(workspaceId: string): Promise<void>;
}

interface SessionizerRuntime {
  workspaces: SessionizerWorkspaceRuntime;
  tabs: LayoutTabs;
  panes: LayoutPanes;
  config: SessionizerConfig;
  pickRows: (
    rows: readonly string[],
    options?: PickOptions
  ) => Promise<string[] | null>;
  listProjects: (roots: string[]) => string[];
  createLayout: LayoutApplier;
  logger: Pick<typeof console, "log" | "error">;
  exit: (code: number) => never;
}

function workspaceRow(workspace: Workspace): string {
  const label = rowField(workspace.label || workspaceName(workspace));
  const summary = rowField(workspaceSummary(workspace));
  const cwd = rowField(workspacePath(workspace));
  const branch = rowField(workspace.worktree?.branch);
  const tabCount = String(workspace.tab_count ?? 0);
  const paneCount = String(workspace.pane_count ?? 0);

  return [
    workspace.workspace_id,
    label,
    summary,
    cwd,
    branch,
    tabCount,
    paneCount,
  ].join(WORKSPACE_ROW_DELIMITER);
}

function extractWorkspaceId(row: string): string {
  return row.split(WORKSPACE_ROW_DELIMITER)[0] ?? row;
}

export async function runSessionizer(
  runtime: SessionizerRuntime = createRuntime()
): Promise<void> {
  const { workspaces, tabs, panes, config } = runtime;

  const existing = await runtime.pickRows(
    (await workspaces.list()).map(workspaceRow),
    {
      prompt: "Switch session (Esc for new): ",
      header: "↑↓ navigate, Enter select, Esc → new project",
      delimiter: WORKSPACE_ROW_DELIMITER,
      withNth: "2",
      preview: WORKSPACE_PREVIEW,
      previewWindow: "right:50%",
    }
  );

  if (existing && existing.length > 0) {
    await workspaces.focus(extractWorkspaceId(existing[0]!));
    return;
  }

  const projects = runtime.listProjects(config.projects.roots);
  if (projects.length === 0) {
    runtime.logger.error("No projects found in configured directories.");
    runtime.exit(1);
  }

  const selected = await runtime.pickRows(projects, {
    prompt: "Project: ",
    header: "Select a project to create a workspace",
    preview: PROJECT_PREVIEW,
    previewWindow: "right:50%",
  });

  if (!selected || selected.length === 0) return;

  const project = selected[0]!;
  const projectName = project.split("/").pop() ?? project;
  const label = sanitizeName(projectName);
  const workspace = await workspaces.create({
    cwd: project,
    label,
    focus: false,
  });

  const layoutConfig = resolveLayoutConfig(project, config);
  await runtime.createLayout(workspace, project, layoutConfig, tabs, panes);
  await workspaces.focus(workspace.workspace_id);

  runtime.logger.log(
    `✓ workspace '${label}' created and focused (${workspace.workspace_id})`
  );
}

function workspaceName(workspace: Workspace): string {
  const path = workspacePath(workspace);
  if (path) {
    return basename(path);
  }

  return workspace.workspace_id;
}

function workspaceSummary(workspace: Workspace): string {
  const path = workspacePath(workspace);
  const location = path ? basename(path) : workspace.worktree?.repo_name;
  const branch = workspace.worktree?.branch;
  if (branch) {
    return location ? `${branch} · ${location}` : branch;
  }

  if (location) {
    return location;
  }

  const tabs = workspace.tab_count ?? 0;
  const panes = workspace.pane_count ?? 0;
  return `${tabs} tabs · ${panes} panes`;
}

function workspacePath(workspace: Workspace): string | undefined {
  return (
    workspace.cwd ??
    workspace.worktree?.checkout_path ??
    workspace.worktree?.repo_root ??
    workspace.worktree?.path
  );
}

function rowField(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replaceAll("\t", " ").replaceAll("\n", " ").trim();
}

function createRuntime(): SessionizerRuntime {
  const herdr = new Herdr();

  return {
    workspaces: new Workspaces(herdr),
    tabs: new Tabs(herdr),
    panes: new Panes(herdr),
    config: loadConfig(),
    pickRows: pick,
    listProjects,
    createLayout: createProjectLayout,
    logger: console,
    exit: (code) => process.exit(code),
  };
}

if (import.meta.main) {
  runSessionizer().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
