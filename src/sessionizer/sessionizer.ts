import { basename } from "node:path";

import {
  listProjects,
  normalizePath,
  sanitizeName,
  type ProjectDiscoveryOptions,
} from "../discovery/discovery.ts";

import type { Pane, Workspace } from "../client/types.ts";
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
import { WORKSPACE_PREVIEW } from "../ui/previews.ts";

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
  listProjects: (
    roots: string[],
    options?: ProjectDiscoveryOptions
  ) => string[];
  listPanes: () => Promise<Pane[]>;
  createLayout: LayoutApplier;
  logger: Pick<typeof console, "log" | "error">;
  exit: (code: number) => never;
}

function workspaceRow(workspace: Workspace): string {
  const label = `● ${rowField(workspace.label || workspaceName(workspace))}`;
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

/**
 * A project row reuses the workspace row shape so one fzf list and one
 * preview cover both: an empty id marks it as "create", and the preview
 * skips the tab/pane counts it does not have.
 */
function projectRow(project: string, roots: readonly string[]): string {
  const name = projectDisplayName(project, roots);

  return [
    "",
    `  ${rowField(name)}`,
    "new workspace",
    rowField(project),
    "",
    "",
    "",
  ].join(WORKSPACE_ROW_DELIMITER);
}

/**
 * Path relative to the configured root it was found under, so nested repos
 * (`org/repo`) stay matchable by their parent; basename otherwise.
 */
function projectDisplayName(project: string, roots: readonly string[]): string {
  for (const root of roots) {
    const base = normalizePath(root);
    if (base && project.startsWith(`${base}/`)) {
      return project.slice(base.length + 1);
    }
  }

  return basename(project);
}

/** True when a workspace or pane sits in the project or below it. */
function isOpen(project: string, openPaths: readonly string[]): boolean {
  return openPaths.some(
    (path) => path === project || path.startsWith(`${project}/`)
  );
}

export async function runSessionizer(
  runtime: SessionizerRuntime = createRuntime()
): Promise<void> {
  const { workspaces, tabs, panes, config } = runtime;

  const [listed, openPanes] = await Promise.all([
    workspaces.list(),
    runtime.listPanes(),
  ]);
  // `workspace list` omits cwd for workspaces Sessionizer did not create;
  // their panes still report it.
  const openWorkspaces = listed.map((workspace) =>
    workspacePath(workspace)
      ? workspace
      : {
          ...workspace,
          cwd: openPanes.find(
            (pane) => pane.workspace_id === workspace.workspace_id && pane.cwd
          )?.cwd,
        }
  );
  const openPaths = [
    ...openWorkspaces.map((workspace) => workspacePath(workspace)),
    ...openPanes.map((pane) => pane.cwd),
  ]
    .map(normalizePath)
    .filter(Boolean);
  // A project that already has a workspace is reached through that
  // workspace's row (ADR-0001: focus, never recreate).
  const projects = runtime
    .listProjects(config.projects.roots, config.projects)
    .filter((project) => !isOpen(normalizePath(project), openPaths));

  const rows = [
    ...openWorkspaces.map(workspaceRow),
    ...projects.map((project) => projectRow(project, config.projects.roots)),
  ];
  if (rows.length === 0) {
    runtime.logger.error("No projects found in configured directories.");
    runtime.exit(1);
  }

  const selected = await runtime.pickRows(rows, {
    prompt: "Open: ",
    delimiter: WORKSPACE_ROW_DELIMITER,
    withNth: "2",
    preview: WORKSPACE_PREVIEW,
    previewWindow: "right:50%",
  });

  if (!selected || selected.length === 0) return;

  const row = selected[0]!;
  const workspaceId = extractWorkspaceId(row);
  if (workspaceId) {
    await workspaces.focus(workspaceId);
    return;
  }

  const project = row.split(WORKSPACE_ROW_DELIMITER)[3] ?? "";
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
  const panes = new Panes(herdr);

  return {
    workspaces: new Workspaces(herdr),
    tabs: new Tabs(herdr),
    panes,
    config: loadConfig(),
    pickRows: pick,
    listProjects,
    listPanes: () => panes.list(),
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
