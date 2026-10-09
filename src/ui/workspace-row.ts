import { basename } from "node:path";

import type { Workspace } from "../client/types.ts";

export const WORKSPACE_ROW_DELIMITER = "\t";

/**
 * Rows are tab-delimited positionals consumed by fzf `--with-nth` and the
 * preview snippets in `src/ui/previews.ts`. Columns (in order):
 *
 *   {1} id          workspace.workspace_id
 *   {2} label       workspace.label (or basename fallback)
 *   {3} summary     workspaceSummary(workspace)
 *   {4} cwd         workspace.cwd / worktree.checkout_path / repo_root / path
 *   {5} branch      workspace.worktree.branch
 *   {6} repo_name   workspace.worktree.repo_name
 *   {7} provenance  "worktree" when workspace.worktree is set, else "project"
 *   {8} tabs        workspace.tab_count
 *   {9} panes       workspace.pane_count
 */
export function workspaceRow(workspace: Workspace): string {
  const baseLabel = rowField(workspace.label || workspaceName(workspace));
  // Linked worktree checkouts are shown as "repo / label" so the user can
  // tell which repo a worktree belongs to at a glance.
  const linkedRepoName =
    workspace.worktree?.is_linked_worktree === true
      ? workspace.worktree.repo_name
      : undefined;
  const label = linkedRepoName
    ? rowField(`${linkedRepoName} / ${baseLabel}`)
    : baseLabel;
  const summary = rowField(workspaceSummary(workspace));
  const cwd = rowField(workspacePath(workspace));
  const branch = rowField(workspace.worktree?.branch);
  const repoName = rowField(workspace.worktree?.repo_name);
  const provenance =
    workspace.worktree?.is_linked_worktree === true ? "worktree" : "project";
  const tabCount = String(workspace.tab_count ?? 0);
  const paneCount = String(workspace.pane_count ?? 0);

  return [
    workspace.workspace_id,
    label,
    summary,
    cwd,
    branch,
    repoName,
    provenance,
    tabCount,
    paneCount,
  ].join(WORKSPACE_ROW_DELIMITER);
}

export function extractWorkspaceId(row: string): string {
  return row.split(WORKSPACE_ROW_DELIMITER)[0] ?? row;
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
