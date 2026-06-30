import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Enumerate project directories from a set of base root paths.
 * Scans each base for immediate child directories.
 */
export function listProjects(bases: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory()) seen.add(join(base, entry.name));
    }
  }
  return [...seen].sort();
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
