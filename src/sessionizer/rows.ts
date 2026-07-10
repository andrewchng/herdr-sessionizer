import { statSync } from "node:fs";

import type {
  CurrentConfig,
  FindConfig,
  RecentConfig,
  SessionizerConfig,
} from "../config/config.ts";
import type { Frecency } from "../frecency/frecency.ts";
import type { Workspace } from "../client/types.ts";
import {
  listCurrentDirectories,
  listProjects,
  normalizePath,
  type CurrentDirOptions,
  type ProjectDiscoveryOptions,
} from "../discovery/discovery.ts";
import {
  buildFindArgv,
  candidateRows,
  directoryCandidate,
  directoryCandidates,
  isRowEncodable,
  mergeCandidates,
  openCandidates,
  type Candidate,
} from "./candidates.ts";

/** A picker source, plus the synthetic "default" merged view. */
export type RowSource =
  | "default"
  | "open"
  | "recent"
  | "current"
  | "root"
  | "find";

export const ROW_SOURCES: readonly RowSource[] = [
  "default",
  "open",
  "recent",
  "current",
  "root",
  "find",
];

export function isRowSource(value: string): value is RowSource {
  return (ROW_SOURCES as readonly string[]).includes(value);
}

/**
 * Side-effecting dependencies the row builders need. Injected so the merge
 * logic can be exercised without touching Herdr, zoxide, or the filesystem.
 */
export interface RowDeps {
  listWorkspaces: () => Promise<Workspace[]>;
  frecency: Frecency;
  listProjects: (roots: string[], options: ProjectDiscoveryOptions) => string[];
  listCurrentDirectories: (cwd: string, options: CurrentDirOptions) => string[];
  runFind: (cwd: string, find: FindConfig) => string[];
  dirExists: (path: string) => boolean;
}

function recentCandidates(deps: RowDeps, recent: RecentConfig): Candidate[] {
  if (!recent.enabled) return [];
  const out: Candidate[] = [];
  for (const entry of deps.frecency.list()) {
    if (out.length >= recent.limit) break;
    if (!deps.dirExists(entry.path)) continue;
    out.push(directoryCandidate(entry.path, "recent", entry.score));
  }
  return out;
}

function currentCandidates(
  deps: RowDeps,
  cwd: string,
  current: CurrentConfig
): Candidate[] {
  if (!current.enabled || cwd.trim() === "") return [];
  const dirs = deps.listCurrentDirectories(cwd, {
    siblings: current.siblings,
    children: current.children,
  });
  return directoryCandidates(dirs, "current");
}

function rootCandidates(deps: RowDeps, config: SessionizerConfig): Candidate[] {
  return directoryCandidates(
    deps.listProjects(config.projects.roots, config.projects),
    "root"
  );
}

/**
 * Build the candidates for a single source, or the merged default view. The
 * default order (open → recent → current → root) doubles as dedup priority:
 * an open workspace shadows a bare directory at the same path.
 */
export async function buildCandidates(
  source: RowSource,
  cwd: string,
  config: SessionizerConfig,
  deps: RowDeps
): Promise<Candidate[]> {
  switch (source) {
    case "open":
      return openCandidates(await deps.listWorkspaces());
    case "recent":
      return recentCandidates(deps, config.recent);
    case "current":
      return currentCandidates(deps, cwd, config.current);
    case "root":
      return rootCandidates(deps, config);
    case "find":
      return directoryCandidates(deps.runFind(cwd, config.find), "find");
    case "default":
    default:
      return mergeCandidates([
        openCandidates(await deps.listWorkspaces()),
        recentCandidates(deps, config.recent),
        currentCandidates(deps, cwd, config.current),
        rootCandidates(deps, config),
      ]);
  }
}

/** Build encoded picker rows for a source, dropping unrepresentable paths. */
export async function buildRows(
  source: RowSource,
  cwd: string,
  config: SessionizerConfig,
  deps: RowDeps
): Promise<string[]> {
  const candidates = (await buildCandidates(source, cwd, config, deps)).filter(
    isRowEncodable
  );
  return candidateRows(candidates);
}

/** Run the deep-search command and return absolute directory paths. */
export function defaultRunFind(cwd: string, find: FindConfig): string[] {
  const hasFd = Bun.which("fd") !== null;
  const argv = buildFindArgv(find, hasFd);
  try {
    const proc = Bun.spawnSync(argv, {
      stdout: "pipe",
      stderr: "pipe",
      cwd,
    });
    const stdout = proc.stdout.toString();
    if (stdout.length === 0) return [];
    return stdout
      .split("\n")
      .map((line) => normalizePath(line.trim()))
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

export function defaultDirExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Assemble production RowDeps from a workspace lister and frecency backend,
 * wiring the real discovery + filesystem helpers.
 */
export function createRowDeps(deps: {
  listWorkspaces: () => Promise<Workspace[]>;
  frecency: Frecency;
}): RowDeps {
  return {
    listWorkspaces: deps.listWorkspaces,
    frecency: deps.frecency,
    listProjects,
    listCurrentDirectories,
    runFind: defaultRunFind,
    dirExists: defaultDirExists,
  };
}
