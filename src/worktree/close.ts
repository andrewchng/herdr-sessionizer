import { Herdr } from "../client/herdr.ts";
import type { Workspace } from "../client/types.ts";
import { Workspaces } from "../ops/workspaces.ts";
import { Worktrees } from "../ops/worktrees.ts";
import type { PickOptions } from "../ui/fzf.ts";
import { pick } from "../ui/fzf.ts";
import {
  WORKSPACE_CLOSE_PREVIEW,
  WORKTREE_CLOSE_PREVIEW,
} from "../ui/previews.ts";
import {
  extractWorkspaceId,
  workspaceRow,
  WORKSPACE_ROW_DELIMITER,
} from "../ui/workspace-row.ts";

export type CloseMode = "close" | "remove";

const CLOSE_MODE_DELIMITER = "\t";

const CLOSE_MODES = [
  { mode: "close", label: "Close workspace" },
  { mode: "remove", label: "Remove worktrees" },
] as const;

export interface CloseRuntime {
  workspaces: Pick<Workspaces, "list">;
  /**
   * Close a workspace session, leaving any git worktree checkout intact.
   * Pass `group: true` to close a parent workspace plus all its worktrees.
   */
  close: (workspaceId: string, options?: { group?: boolean }) => Promise<void>;
  /** Close a workspace and delete its git worktree checkout. */
  remove: (workspaceId: string) => Promise<void>;
  pickRows: (
    rows: readonly string[],
    options?: PickOptions
  ) => Promise<string[] | null>;
  logger: Pick<typeof console, "log" | "error">;
  exit: (code: number) => never;
}

/**
 * Step 2 — pick workspace rows and close/remove them. `mode` selects the
 * action; pass it explicitly to skip the Step 1 mode menu (used by tests).
 */
export async function runClosePicker(
  mode?: CloseMode,
  runtime: CloseRuntime = createRuntime()
): Promise<void> {
  const selectedMode = mode ?? (await pickCloseMode(runtime));
  if (selectedMode === null) return;

  const workspaces = await runtime.workspaces.list();
  // Remove mode targets actual linked worktree checkouts only. A parent/main
  // workspace of a repo that has worktrees also carries `worktree` provenance,
  // but `is_linked_worktree` is false there — filtering on the boolean would
  // list the parent repo and make `worktree remove` a no-op on it.
  const candidates =
    selectedMode === "remove"
      ? workspaces.filter(
          (workspace) => workspace.worktree?.is_linked_worktree === true
        )
      : workspaces;
  // Group rows by repo so worktrees of the same repo sit together in the
  // picker (fzf keeps input order until a query re-sorts by score).
  const rows = [...candidates].sort((a, b) =>
    (a.worktree?.repo_name ?? "").localeCompare(b.worktree?.repo_name ?? "")
  ).map(workspaceRow);

  if (rows.length === 0) {
    const hint =
      selectedMode === "remove"
        ? "No open worktree workspaces. Create one with `sessionizer.worktree-open`."
        : "No open workspaces. Create one with `sessionizer.open`.";
    runtime.logger.log(hint);
    runtime.exit(0);
    return;
  }

  const selected = await runtime.pickRows(rows, {
    prompt:
      selectedMode === "remove" ? "Remove worktree: " : "Close workspace: ",
    header: "Tab mark, Enter act, Esc cancel",
    multi: true,
    delimiter: WORKSPACE_ROW_DELIMITER,
    withNth: "2",
    preview:
      selectedMode === "remove"
        ? WORKTREE_CLOSE_PREVIEW
        : WORKSPACE_CLOSE_PREVIEW,
    previewWindow: "right:50%",
  });

  if (!selected || selected.length === 0) return;

  const verb = selectedMode === "remove" ? "removed" : "closed";
  const summaryVerb = selectedMode === "remove" ? "Removed" : "Closed";
  const noun = selectedMode === "remove" ? "worktree(s)" : "workspace(s)";
  let succeeded = 0;
  let failed = 0;

  const workspaceById = new Map<string, Workspace>(
    workspaces.map((workspace) => [workspace.workspace_id, workspace])
  );
  // In close mode, a parent/main workspace (a repo that has open worktrees)
  // must be closed with --group. A group close also closes that repo's child
  // worktrees, so a child selected alongside its parent is redundant — skip it.
  const parentRepos = new Set<string>();
  if (selectedMode === "close") {
    for (const row of selected) {
      const workspace = workspaceById.get(extractWorkspaceId(row));
      if (
        workspace?.worktree?.is_linked_worktree === false &&
        workspace.worktree.repo_name
      ) {
        parentRepos.add(workspace.worktree.repo_name);
      }
    }
  }

  for (const row of selected) {
    const id = extractWorkspaceId(row);
    const workspace = workspaceById.get(id);
    const isChild = workspace?.worktree?.is_linked_worktree === true;
    const isParent = workspace?.worktree?.is_linked_worktree === false;
    const repo = workspace?.worktree?.repo_name;

    if (selectedMode === "close" && isChild && repo && parentRepos.has(repo)) {
      runtime.logger.log(`✓ ${verb} ${id} (covered by group close)`);
      succeeded += 1;
      continue;
    }

    try {
      if (selectedMode === "remove") {
        await runtime.remove(id);
      } else if (isParent) {
        await runtime.close(id, { group: true });
      } else {
        await runtime.close(id);
      }
      succeeded += 1;
      runtime.logger.log(`✓ ${verb} ${id}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      runtime.logger.error(`✗ failed to ${verb} ${id}: ${message}`);
    }
  }

  runtime.logger.log(`${summaryVerb} ${succeeded} ${noun}, ${failed} failed.`);
  if (failed > 0) runtime.exit(1);
}

/** Step 1 — explicit in-flow mode selection (close vs destructive remove). */
async function pickCloseMode(runtime: CloseRuntime): Promise<CloseMode | null> {
  const rows = CLOSE_MODES.map(
    ({ mode, label }) => `${mode}${CLOSE_MODE_DELIMITER}${label}`
  );
  const selected = await runtime.pickRows(rows, {
    prompt: "Close workspaces: ",
    header: "Select how to close · Enter choose · Esc cancel",
    delimiter: CLOSE_MODE_DELIMITER,
    withNth: "2",
  });
  if (!selected || selected.length === 0) return null;

  const mode = selected[0]!.split(CLOSE_MODE_DELIMITER)[0];
  return mode === "close" || mode === "remove" ? mode : null;
}

function createRuntime(): CloseRuntime {
  const herdr = new Herdr();
  const workspaces = new Workspaces(herdr);
  const worktrees = new Worktrees(herdr);

  return {
    workspaces,
    close: (workspaceId, options) => workspaces.close(workspaceId, options),
    remove: (workspaceId) => worktrees.remove(workspaceId),
    pickRows: pick,
    logger: console,
    exit: (code) => process.exit(code),
  };
}
