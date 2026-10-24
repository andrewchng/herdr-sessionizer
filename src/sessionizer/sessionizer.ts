import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import {
  expandHome,
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
import {
  pickOrCreate,
  type PickOptions,
  type PickOrCreateResult,
} from "../ui/fzf.ts";
import { WORKSPACE_PREVIEW } from "../ui/previews.ts";
import {
  extractRowCwd,
  extractWorkspaceId,
  openWorkspaceRow,
  projectRow,
  workspacePath,
  WORKSPACE_ROW_DELIMITER,
} from "../ui/workspace-row.ts";
/** Creates `<first root>/<query>` even when the query fuzzy-matches rows. */
const CREATE_KEY = "ctrl-n";

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
  pick: (
    rows: readonly string[],
    options: PickOptions & { createKey: string; createPrompt?: string }
  ) => Promise<PickOrCreateResult | null>;
  listProjects: (
    roots: string[],
    options?: ProjectDiscoveryOptions
  ) => string[];
  listPanes: () => Promise<Pane[]>;
  /** mkdir -p; returns true when the directory did not exist before. */
  makeProjectDir: (path: string) => boolean;
  /** Runs `git init` so the new project shows up in git_only discovery. */
  initRepo: (path: string) => void;
  createLayout: LayoutApplier;
  logger: Pick<typeof console, "log" | "error">;
  exit: (code: number) => never;
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
  // Group rows by repo so a repo's parent/main workspace and its linked
  // worktrees sit next to each other in the picker (fzf keeps input order
  // until a query re-sorts by score). The sort is stable, so Herdr's list
  // order is preserved within a repo cluster; rows without worktree
  // provenance have an empty key and keep their original relative order,
  // appearing before the repo clusters (empty string sorts first).
  listed.sort((a, b) =>
    (a.worktree?.repo_name ?? "").localeCompare(b.worktree?.repo_name ?? "")
  );
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
    ...openWorkspaces.map(openWorkspaceRow),
    ...projects.map((project) =>
      projectRow(project, projectDisplayName(project, config.projects.roots))
    ),
  ];

  const picked = await runtime.pick(rows, {
    prompt: "Open: ",
    delimiter: WORKSPACE_ROW_DELIMITER,
    withNth: "2",
    preview: WORKSPACE_PREVIEW,
    previewWindow: "right:50%",
    createKey: CREATE_KEY,
    createPrompt: "Create: ",
  });

  if (!picked) return;

  let project: string;
  if (picked.kind === "create") {
    const root = config.projects.roots[0];
    const path = root ? newProjectPath(expandHome(root), picked.query) : null;
    if (!path) {
      runtime.logger.error(`Invalid project name: ${picked.query}`);
      runtime.exit(1);
    }
    if (runtime.makeProjectDir(path)) runtime.initRepo(path);

    // Typing the name of an open project focuses it (ADR-0001).
    const open = openWorkspaces.find(
      (workspace) => normalizePath(workspacePath(workspace)) === path
    );
    if (open) {
      await workspaces.focus(open.workspace_id);
      return;
    }
    project = path;
  } else {
    const workspaceId = extractWorkspaceId(picked.row);
    if (workspaceId) {
      await workspaces.focus(workspaceId);
      return;
    }
    project = extractRowCwd(picked.row);
  }

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

/**
 * `<root>/<query>` for a typed project name. Spaces become `-`; nested
 * names (`org/repo`) are kept; anything escaping the root (absolute
 * paths, `~`, `.` or `..` segments) is refused with null.
 */
export function newProjectPath(root: string, query: string): string | null {
  if (query.startsWith("/") || query.startsWith("~")) return null;
  const segments = query
    .split("/")
    .map((segment) => segment.trim().replace(/\s+/g, "-"))
    .filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return join(normalizePath(root), ...segments);
}

function createRuntime(): SessionizerRuntime {
  const herdr = new Herdr();
  const panes = new Panes(herdr);

  return {
    workspaces: new Workspaces(herdr),
    tabs: new Tabs(herdr),
    panes,
    config: loadConfig(),
    pick: pickOrCreate,
    listProjects,
    listPanes: () => panes.list(),
    makeProjectDir: (path) => {
      if (existsSync(path)) return false;
      mkdirSync(path, { recursive: true });
      return true;
    },
    initRepo: (path) => {
      spawnSync("git", ["init", "--quiet"], { cwd: path, stdio: "ignore" });
    },
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
