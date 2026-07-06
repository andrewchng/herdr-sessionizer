import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface ProjectDiscoveryOptions {
  git_only?: boolean;
  depth?: number;
}

/**
 * Enumerate project directories from a set of base root paths.
 * Scans each base for immediate child directories by default.
 */
export function listProjects(
  bases: readonly string[],
  options: ProjectDiscoveryOptions = {}
): string[] {
  const seen = new Set<string>();
  const gitOnly = options.git_only ?? false;

  for (const base of bases) {
    if (!existsSync(base)) continue;

    if (gitOnly) {
      discoverGitProjects(base, options.depth ?? 1, seen);
      continue;
    }

    for (const path of listChildDirectories(base)) {
      seen.add(path);
    }
  }

  return [...seen].sort();
}

function discoverGitProjects(base: string, depth: number, seen: Set<string>) {
  const visited = new Set<string>();

  function visit(path: string, currentDepth: number) {
    if (currentDepth > depth || !isDirectory(path)) return;

    if (hasGitMetadata(path)) {
      seen.add(path);
      return;
    }

    const realPath = safeRealpath(path);
    if (realPath) {
      if (visited.has(realPath)) return;
      visited.add(realPath);
    }

    for (const child of listChildDirectories(path)) {
      visit(child, currentDepth + 1);
    }
  }

  for (const child of listChildDirectories(base)) {
    visit(child, 1);
  }
}

function listChildDirectories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .map((entry) => join(path, entry.name))
      .filter(isDirectory);
  } catch {
    return [];
  }
}

function hasGitMetadata(path: string): boolean {
  return existsSync(join(path, ".git"));
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safeRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/**
 * Replace characters that are invalid in Herdr workspace labels.
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Normalize a filesystem path: strip trailing slashes, handle undefined.
 */
export function normalizePath(path: string | undefined): string {
  if (!path) return "";
  return path.replace(/\/+$/, "");
}

/**
 * Expand a leading `~` to the user's home directory.
 */
export function expandHome(value: string): string {
  return value.startsWith("~/") ? value.replace("~", homedir()) : value;
}

/**
 * Quote a string for safe shell use: wraps in single quotes and escapes
 * embedded single quotes per the standard `'\\''` pattern.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Convert a branch name to a filesystem-safe slug.
 */
export function worktreeSlug(branch: string): string {
  return branch
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
