import { basename } from "node:path";

import type { FindConfig } from "../config/config.ts";
import type { Workspace } from "../client/types.ts";
import { normalizePath, shortenHome } from "../discovery/discovery.ts";

/** Where a candidate came from; also drives the source-toggle key bindings. */
export type CandidateSource = "open" | "recent" | "current" | "root" | "find";

/** Whether selecting the candidate focuses a workspace or creates one. */
export type CandidateKind = "workspace" | "directory";

export interface Candidate {
  kind: CandidateKind;
  /** Stable key: `ws:<workspace_id>` or `dir:<abs_path>`. */
  key: string;
  /** Display name (basename or workspace label). */
  name: string;
  /** Absolute directory path (may be empty for a workspace without a cwd). */
  path: string;
  source: CandidateSource;
  /** Frecency score, when known (recent source). */
  score?: number;
  branch?: string;
  tabs?: number;
  panes?: number;
}

export const CANDIDATE_ROW_DELIMITER = "\t";

const WS_KEY_PREFIX = "ws:";
const DIR_KEY_PREFIX = "dir:";

export function directoryKey(path: string): string {
  return `${DIR_KEY_PREFIX}${path}`;
}

export function workspaceKey(workspaceId: string): string {
  return `${WS_KEY_PREFIX}${workspaceId}`;
}

export function workspaceIdFromKey(key: string): string {
  return key.startsWith(WS_KEY_PREFIX) ? key.slice(WS_KEY_PREFIX.length) : key;
}

/** Best available directory for a workspace (cwd, else worktree metadata). */
export function workspacePath(workspace: Workspace): string {
  return (
    workspace.cwd ??
    workspace.worktree?.checkout_path ??
    workspace.worktree?.repo_root ??
    workspace.worktree?.path ??
    ""
  );
}

function workspaceName(workspace: Workspace): string {
  if (workspace.label) return workspace.label;
  const path = workspacePath(workspace);
  if (path) return basename(path);
  return workspace.workspace_id;
}

/** Build candidates for currently-open Herdr workspaces. */
export function openCandidates(workspaces: readonly Workspace[]): Candidate[] {
  return workspaces.map((workspace) => ({
    kind: "workspace" as const,
    key: workspaceKey(workspace.workspace_id),
    name: workspaceName(workspace),
    path: workspacePath(workspace),
    source: "open" as const,
    branch: workspace.worktree?.branch,
    tabs: workspace.tab_count,
    panes: workspace.pane_count,
  }));
}

/** Build a directory candidate for a given source. */
export function directoryCandidate(
  path: string,
  source: CandidateSource,
  score?: number
): Candidate {
  return {
    kind: "directory",
    key: directoryKey(path),
    name: basename(path) || path,
    path,
    source,
    score,
  };
}

export function directoryCandidates(
  paths: readonly string[],
  source: CandidateSource
): Candidate[] {
  return paths.map((path) => directoryCandidate(path, source));
}

/**
 * Merge ordered candidate groups into a single deduplicated list. Groups are
 * passed in priority order (e.g. open, recent, current, root); the first group
 * to claim a key or path wins, so an open workspace always shadows a bare
 * directory pointing at the same location.
 */
export function mergeCandidates(groups: Candidate[][]): Candidate[] {
  const seenKeys = new Set<string>();
  const seenPaths = new Set<string>();
  const out: Candidate[] = [];

  for (const group of groups) {
    for (const candidate of group) {
      if (seenKeys.has(candidate.key)) continue;
      const normalized = candidate.path ? normalizePath(candidate.path) : "";
      // Only directories are dropped when their path is already represented
      // (e.g. shadowed by an open workspace or an earlier directory). Two
      // distinct open workspaces that resolve to the same path must both stay
      // selectable, so workspace candidates are never dropped by path.
      if (
        candidate.kind === "directory" &&
        normalized &&
        seenPaths.has(normalized)
      ) {
        continue;
      }
      seenKeys.add(candidate.key);
      if (normalized) seenPaths.add(normalized);
      out.push(candidate);
    }
  }

  return out;
}

/**
 * Whether a candidate can be encoded as a tab-delimited row without loss. A
 * directory whose path contains the delimiter (a tab) or a newline cannot be
 * represented — its `dir:<path>` key would split and decode to the wrong
 * directory — so such directories are excluded. Workspaces are always encodable:
 * their key is `ws:<id>` and selection resolves through the key, not the path.
 */
export function isRowEncodable(candidate: Candidate): boolean {
  if (candidate.kind !== "directory") return true;
  return !/[\t\n\r]/.test(candidate.path);
}

/** The label shown in the picker (fzf column 2, also the fuzzy-match target). */
export function candidateDisplay(candidate: Candidate): string {
  const parts = [candidate.name];
  if (candidate.branch) parts[0] = `${candidate.name} (${candidate.branch})`;
  if (candidate.path) parts.push(shortenHome(candidate.path));
  return parts.join("  ");
}

function metaField(value: unknown): string {
  // Strip delimiters/newlines from display + metadata columns.
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.replaceAll("\t", " ").replaceAll("\n", " ").trim();
}

function pathField(value: string): string {
  // Keep spaces, but neutralize characters that would break the tab-delimited
  // row. Directory paths containing a tab are filtered out upstream
  // (isRowEncodable); for workspaces the canonical id lives in the key, so
  // substituting here only affects the display/preview path column.
  return value
    .replaceAll("\t", " ")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

/** Encode a candidate as a tab-delimited picker row. */
export function candidateRow(candidate: Candidate): string {
  return [
    candidate.key,
    metaField(candidateDisplay(candidate)),
    candidate.source,
    pathField(candidate.path),
    metaField(candidate.branch),
    candidate.tabs === undefined ? "" : String(candidate.tabs),
    candidate.panes === undefined ? "" : String(candidate.panes),
  ].join(CANDIDATE_ROW_DELIMITER);
}

export function candidateRows(candidates: readonly Candidate[]): string[] {
  return candidates.map(candidateRow);
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Decode a picker row back into the fields needed to resolve a selection. */
export function candidateFromRow(row: string): Candidate {
  const parts = row.split(CANDIDATE_ROW_DELIMITER);
  const key = parts[0] ?? row;
  const kind: CandidateKind = key.startsWith(WS_KEY_PREFIX)
    ? "workspace"
    : "directory";
  // For directory rows the key carries the canonical path, immune to any
  // column corruption; workspaces fall back to the dedicated path column.
  const path =
    kind === "directory" && key.startsWith(DIR_KEY_PREFIX)
      ? key.slice(DIR_KEY_PREFIX.length)
      : (parts[3] ?? "");

  return {
    kind,
    key,
    name: parts[1] ?? "",
    source: (parts[2] as CandidateSource) || "root",
    path,
    branch: parts[4] || undefined,
    tabs: parseCount(parts[5]),
    panes: parseCount(parts[6]),
  };
}

/**
 * Build the argv for the deep "find" search. Prefers `fd` (fast, respects
 * hidden/excludes) and falls back to POSIX `find` when fd is unavailable.
 */
export function buildFindArgv(find: FindConfig, hasFd: boolean): string[] {
  const depth = String(find.depth);
  if (hasFd) {
    return [
      "fd",
      "--type",
      "d",
      "--hidden",
      "--absolute-path",
      "--max-depth",
      depth,
      "--exclude",
      ".git",
      "--exclude",
      "node_modules",
      "--exclude",
      ".Trash",
      ".",
      ...find.roots,
    ];
  }
  return [
    "find",
    ...find.roots,
    "-maxdepth",
    depth,
    "-type",
    "d",
    "-not",
    "-path",
    "*/.git/*",
    "-not",
    "-path",
    "*/node_modules/*",
  ];
}
