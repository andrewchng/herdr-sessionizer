import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * A directory ranked by frecency (frequency + recency). Higher score means the
 * directory is more likely to be the one the user wants next.
 */
export interface FrecencyEntry {
  path: string;
  score: number;
}

/**
 * Frecency backend for the "recent" picker source. Sessionizer reads a ranked
 * list to show recent directories and records a visit whenever it opens one.
 */
export interface Frecency {
  /** Ranked directories, most frecent first. */
  list(): FrecencyEntry[];
  /** Record that `path` was opened, boosting its rank. */
  add(path: string): void;
}

/**
 * Minimal synchronous command runner so the zoxide integration can be tested
 * without shelling out. Returns stdout plus whether the command succeeded.
 */
export interface CommandRunner {
  run(cmd: string, args: string[]): { stdout: string; ok: boolean };
}

const defaultRunner: CommandRunner = {
  run(cmd, args) {
    try {
      const proc = Bun.spawnSync([cmd, ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      return { stdout: proc.stdout.toString(), ok: proc.success };
    } catch {
      return { stdout: "", ok: false };
    }
  },
};

/**
 * Parse a `zoxide query --list --score` line, e.g. "  123.5   /home/user/foo".
 * Returns null for blank or malformed lines.
 */
export function parseZoxideLine(line: string): FrecencyEntry | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  const match = /^([0-9]+(?:\.[0-9]+)?)\s+(.+)$/.exec(trimmed);
  if (!match) return null;
  const score = Number.parseFloat(match[1]!);
  if (!Number.isFinite(score)) return null;
  return { path: match[2]!, score };
}

/**
 * Frecency backed by the user's existing zoxide database. Benefits from shell
 * `cd` history immediately and stays in sync with the rest of their tooling.
 */
export class ZoxideFrecency implements Frecency {
  constructor(private readonly runner: CommandRunner = defaultRunner) {}

  list(): FrecencyEntry[] {
    const { stdout, ok } = this.runner.run("zoxide", [
      "query",
      "--list",
      "--score",
    ]);
    if (!ok) return [];
    const entries: FrecencyEntry[] = [];
    for (const line of stdout.split("\n")) {
      const entry = parseZoxideLine(line);
      if (entry) entries.push(entry);
    }
    // zoxide already prints ascending by score; sort descending for us.
    return entries.sort((a, b) => b.score - a.score);
  }

  add(path: string): void {
    // Fire-and-forget: a failed record must never block opening a workspace.
    this.runner.run("zoxide", ["add", path]);
  }
}

interface StoreRecord {
  count: number;
  lastAccess: number; // epoch milliseconds
}

interface StoreShape {
  entries: Record<string, StoreRecord>;
}

const MAX_STORE_ENTRIES = 500;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 604_800_000;

/**
 * Weight a directory's frequency by how recently it was accessed. Mirrors
 * zoxide's tiered recency multipliers so the built-in fallback ranks similarly.
 */
export function recencyWeight(ageMs: number): number {
  if (ageMs < HOUR) return 4;
  if (ageMs < DAY) return 2;
  if (ageMs < WEEK) return 1;
  return 0.25;
}

/**
 * Self-contained frecency store used when zoxide is not installed. Persists a
 * small JSON file and applies zoxide-style scoring with eviction.
 */
export class StoreFrecency implements Frecency {
  constructor(
    private readonly filePath: string,
    private readonly now: () => number = () => Date.now()
  ) {}

  list(): FrecencyEntry[] {
    const store = this.read();
    const at = this.now();
    return Object.entries(store.entries)
      .map(([path, record]) => ({
        path,
        score: record.count * recencyWeight(at - record.lastAccess),
      }))
      .sort((a, b) => b.score - a.score);
  }

  add(path: string): void {
    const store = this.read();
    const existing = store.entries[path];
    store.entries[path] = {
      count: (existing?.count ?? 0) + 1,
      lastAccess: this.now(),
    };
    this.evict(store);
    this.write(store);
  }

  private evict(store: StoreShape): void {
    const paths = Object.keys(store.entries);
    if (paths.length <= MAX_STORE_ENTRIES) return;
    const at = this.now();
    const ranked = paths.sort((a, b) => {
      const sa =
        store.entries[a]!.count *
        recencyWeight(at - store.entries[a]!.lastAccess);
      const sb =
        store.entries[b]!.count *
        recencyWeight(at - store.entries[b]!.lastAccess);
      return sb - sa;
    });
    for (const path of ranked.slice(MAX_STORE_ENTRIES)) {
      delete store.entries[path];
    }
  }

  private read(): StoreShape {
    try {
      if (!existsSync(this.filePath)) return { entries: {} };
      const parsed = JSON.parse(readFileSync(this.filePath, "utf-8")) as
        | Partial<StoreShape>
        | undefined;
      return { entries: parsed?.entries ?? {} };
    } catch {
      // Corrupt or unreadable store: start fresh rather than crash the picker.
      return { entries: {} };
    }
  }

  private write(store: StoreShape): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(store), "utf-8");
    } catch {
      // Best-effort persistence; ranking still works within the session.
    }
  }
}

/**
 * Default on-disk location for the built-in frecency store, honoring
 * XDG_STATE_HOME when set.
 */
export function defaultStorePath(): string {
  const stateHome =
    process.env.XDG_STATE_HOME && process.env.XDG_STATE_HOME.trim().length > 0
      ? process.env.XDG_STATE_HOME
      : join(homedir(), ".local", "state");
  return join(stateHome, "herdr", "sessionizer", "frecency.json");
}

export interface CreateFrecencyOptions {
  /** Override zoxide detection (defaults to `Bun.which`). */
  hasZoxide?: boolean;
  runner?: CommandRunner;
  storePath?: string;
}

/**
 * Build the appropriate frecency backend: zoxide when available, otherwise the
 * self-contained store.
 */
export function createFrecency(options: CreateFrecencyOptions = {}): Frecency {
  const hasZoxide = options.hasZoxide ?? Bun.which("zoxide") !== null;
  if (hasZoxide) {
    return new ZoxideFrecency(options.runner);
  }
  return new StoreFrecency(options.storePath ?? defaultStorePath());
}
