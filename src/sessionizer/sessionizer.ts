import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizePath,
  sanitizeName,
  shellQuote,
} from "../discovery/discovery.ts";

import type { Workspace } from "../client/types.ts";
import { Herdr } from "../client/herdr.ts";
import type { SessionizerConfig } from "../config/config.ts";
import { loadConfig, resolveLayoutConfig } from "../config/config.ts";
import { createFrecency, type Frecency } from "../frecency/frecency.ts";
import {
  createProjectLayout,
  type LayoutPanes,
  type LayoutTabs,
} from "../layouts/project.ts";
import { Panes } from "../ops/panes.ts";
import { Tabs } from "../ops/tabs.ts";
import { Workspaces } from "../ops/workspaces.ts";
import { pick, type PickOptions } from "../ui/fzf.ts";
import { CANDIDATE_PREVIEW } from "../ui/previews.ts";
import {
  candidateFromRow,
  workspaceIdFromKey,
  workspacePath,
  CANDIDATE_ROW_DELIMITER,
  type Candidate,
} from "./candidates.ts";
import {
  buildRows,
  createRowDeps,
  type RowDeps,
  type RowSource,
} from "./rows.ts";

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
  frecency: Frecency;
  rowDeps: RowDeps;
  pickRows: (
    rows: readonly string[],
    options?: PickOptions
  ) => Promise<string[] | null>;
  createLayout: LayoutApplier;
  resolveCwd: () => string;
  reloadBinds: () => string[];
  logger: Pick<typeof console, "log" | "error">;
  exit: (code: number) => never;
}

const SESSIONIZER_HEADER =
  "enter open · esc cancel · ^a all  ^o open  ^r recent  ^f find";

/** Source-toggle key bindings, mirroring sesh's in-picker reload flow. */
const SOURCE_KEYS: ReadonlyArray<{
  key: string;
  source: RowSource;
  prompt: string;
}> = [
  { key: "ctrl-a", source: "default", prompt: "all" },
  { key: "ctrl-o", source: "open", prompt: "open" },
  { key: "ctrl-r", source: "recent", prompt: "recent" },
  { key: "ctrl-f", source: "find", prompt: "find" },
];

export async function runSessionizer(
  runtime: SessionizerRuntime = createRuntime()
): Promise<void> {
  const { config } = runtime;
  const cwd = runtime.resolveCwd();

  const rows = await buildRows("default", cwd, config, runtime.rowDeps);
  if (rows.length === 0) {
    runtime.logger.error(
      "No open sessions, recent directories, or project folders found."
    );
    runtime.exit(1);
  }

  const selected = await runtime.pickRows(rows, {
    prompt: "Open: ",
    header: SESSIONIZER_HEADER,
    delimiter: CANDIDATE_ROW_DELIMITER,
    withNth: "2",
    preview: CANDIDATE_PREVIEW,
    previewWindow: "right:50%",
    bind: runtime.reloadBinds(),
    // fzf reload subshells inherit this; list.ts reads it so the reloaded
    // sources use the same cwd as the initial view without an injectable
    // --cwd argument inside the bind string.
    env: { SESSIONIZER_CWD: cwd },
  });

  if (!selected || selected.length === 0) return;

  await resolveSelection(candidateFromRow(selected[0]!), runtime);
}

async function resolveSelection(
  candidate: Candidate,
  runtime: SessionizerRuntime
): Promise<void> {
  if (candidate.path) {
    // Record the visit so it climbs the frecency ranking next time.
    runtime.frecency.add(candidate.path);
  }

  if (candidate.kind === "workspace") {
    await runtime.workspaces.focus(workspaceIdFromKey(candidate.key));
    return;
  }

  const path = candidate.path;
  if (!path) return;

  // A directory surfaced by find/recent may already back an open workspace;
  // focus it rather than create a duplicate (ADR-0001: reopen as-is).
  const existing = (await runtime.workspaces.list()).find(
    (workspace) =>
      normalizePath(workspacePath(workspace)) === normalizePath(path)
  );
  if (existing) {
    await runtime.workspaces.focus(existing.workspace_id);
    return;
  }

  const label = sanitizeName(basename(path));
  const workspace = await runtime.workspaces.create({
    cwd: path,
    label,
    focus: false,
  });

  const layoutConfig = resolveLayoutConfig(path, runtime.config);
  await runtime.createLayout(
    workspace,
    path,
    layoutConfig,
    runtime.tabs,
    runtime.panes
  );
  await runtime.workspaces.focus(workspace.workspace_id);

  runtime.logger.log(
    `✓ workspace '${label}' created and focused (${workspace.workspace_id})`
  );
}

/**
 * Build the fzf reload command for a given source. The cwd is passed via the
 * inherited SESSIONIZER_CWD env (see runSessionizer), not as an argument, so no
 * user-controlled path is interpolated into the bind string.
 */
function reloadCommand(
  bun: string,
  listScript: string,
  source: RowSource
): string {
  return `${shellQuote(bun)} run ${shellQuote(listScript)} --source ${source}`;
}

function buildReloadBinds(bun: string, listScript: string): string[] {
  return SOURCE_KEYS.map(
    ({ key, source, prompt }) =>
      `${key}:change-prompt(${prompt}> )+reload(${reloadCommand(bun, listScript, source)})`
  );
}

function defaultResolveCwd(): string {
  const fromEnv = process.env.SESSIONIZER_CWD;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  return process.cwd();
}

function createRuntime(): SessionizerRuntime {
  const herdr = new Herdr();
  const workspaces = new Workspaces(herdr);
  const frecency = createFrecency();
  const bun = process.execPath;
  const listScript = fileURLToPath(new URL("./list.ts", import.meta.url));

  return {
    workspaces,
    tabs: new Tabs(herdr),
    panes: new Panes(herdr),
    config: loadConfig(),
    frecency,
    rowDeps: createRowDeps({
      listWorkspaces: () => workspaces.list(),
      frecency,
    }),
    pickRows: pick,
    createLayout: createProjectLayout,
    resolveCwd: defaultResolveCwd,
    reloadBinds: () => buildReloadBinds(bun, listScript),
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
