import { resolveFzfBin } from "../prerequisites/prerequisites.ts";

export interface PickOptions {
  prompt?: string;
  header?: string;
  multi?: boolean;
  delimiter?: string;
  withNth?: string;
  preview?: string;
  previewWindow?: string;
  bin?: string;
  env?: Record<string, string>;
}

interface PromptQueryOptions {
  prompt?: string;
  header?: string;
  bin?: string;
  env?: Record<string, string>;
}

export async function pick<T extends string>(
  rows: readonly T[],
  options: PickOptions = {}
): Promise<T[] | null> {
  if (rows.length === 0) return null;

  const bin = resolveFzfBin(options.bin);
  const args: string[] = [bin];
  if (options.prompt) args.push("--prompt", options.prompt);
  if (options.header) args.push("--header", options.header);
  if (options.multi) args.push("--multi");
  if (options.delimiter) args.push("--delimiter", options.delimiter);
  if (options.withNth) args.push("--with-nth", options.withNth);
  if (options.preview) args.push("--preview", options.preview);
  if (options.previewWindow)
    args.push("--preview-window", options.previewWindow);

  const proc = Bun.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options.env },
  });

  const input = new TextEncoder().encode(rows.join("\n") + "\n");
  const writeDone = (async () => {
    await proc.stdin.write(input);
    await proc.stdin.flush();
    await proc.stdin.end();
  })();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
    writeDone,
  ]);

  if (exitCode !== 0 && exitCode !== 1 && exitCode !== 130) {
    throw new Error(
      `fzf exited ${exitCode}: ${stderr.trim() || "(no stderr)"}`
    );
  }

  const lines = stdout.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  return lines as T[];
}

export type PickOrCreateResult =
  | { kind: "row"; row: string }
  | { kind: "create"; query: string };

export interface PickOrCreateOptions extends PickOptions {
  /** fzf key that creates from the query even when rows match. */
  createKey: string;
  /** Prompt shown instead of `prompt` while nothing matches. */
  createPrompt?: string;
}

/**
 * Single-row picker that can also hand back what was typed: Enter picks
 * the highlighted row, or returns the query when nothing matches; the
 * create key returns the query either way (fuzzy matching is loose, so a
 * new name often still matches an existing row).
 */
export async function pickOrCreate(
  rows: readonly string[],
  options: PickOrCreateOptions
): Promise<PickOrCreateResult | null> {
  const bin = resolveFzfBin(options.bin);
  const args: string[] = [
    bin,
    "--print-query",
    "--expect",
    options.createKey,
    "--bind",
    "enter:accept-or-print-query",
  ];
  if (options.prompt) args.push("--prompt", options.prompt);
  if (options.prompt && options.createPrompt) {
    // Enter creates when nothing matches, so say so.
    args.push(
      "--bind",
      `result:transform-prompt:[ "$FZF_MATCH_COUNT" -gt 0 ] && printf %s ${shellQuote(options.prompt)} || printf %s ${shellQuote(options.createPrompt)}`
    );
  }
  if (options.header) args.push("--header", options.header);
  if (options.delimiter) args.push("--delimiter", options.delimiter);
  if (options.withNth) args.push("--with-nth", options.withNth);
  if (options.preview) args.push("--preview", options.preview);
  if (options.previewWindow)
    args.push("--preview-window", options.previewWindow);

  const proc = Bun.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options.env },
  });

  const input = new TextEncoder().encode(
    rows.length > 0 ? rows.join("\n") + "\n" : ""
  );
  const writeDone = (async () => {
    await proc.stdin.write(input);
    await proc.stdin.flush();
    await proc.stdin.end();
  })();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
    writeDone,
  ]);

  if (exitCode === 130) return null;
  if (exitCode !== 0 && exitCode !== 1) {
    throw new Error(
      `fzf exited ${exitCode}: ${stderr.trim() || "(no stderr)"}`
    );
  }

  const result = pickOrCreateFromFzfStdout(stdout, options.createKey);
  // Exit 1 is only a result when the create key fired on an empty list.
  if (exitCode === 1 && result?.kind !== "create") return null;
  return result;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Parse `--print-query --expect <key>` output. fzf prints `query`, then
 * `key` (empty for Enter), then the row; with Enter on no match
 * (accept-or-print-query) it prints the query alone, and with the create
 * key on no match it prints query and key and exits 1. Exported for tests.
 */
export function pickOrCreateFromFzfStdout(
  stdout: string,
  createKey: string
): PickOrCreateResult | null {
  const [query = "", key = "", row = ""] = stdout.split("\n");
  const trimmed = query.trim();
  if (key === createKey || !row) {
    return trimmed ? { kind: "create", query: trimmed } : null;
  }
  return { kind: "row", row };
}

/**
 * Free-text prompt via fzf (same Esc/cancel path as pickers).
 * Returns the trimmed query on Enter, or `null` when the user cancels
 * (Esc / Ctrl+C). Empty Enter is still `""` so callers can re-prompt.
 *
 * Uses fzf rather than raw-mode readline so Esc works inside Herdr plugin
 * panes the same way it does for Sessionizer/worktree pickers.
 */
export async function promptQuery(
  options: PromptQueryOptions = {}
): Promise<string | null> {
  const bin = resolveFzfBin(options.bin);
  const args: string[] = [
    bin,
    // Free-text entry: no candidate list, no search, Enter accepts the query.
    "--disabled",
    "--print-query",
    "--bind",
    "enter:accept-or-print-query",
    "--info",
    "hidden",
  ];
  if (options.prompt) args.push("--prompt", options.prompt);
  if (options.header) args.push("--header", options.header);

  const proc = Bun.spawn(args, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options.env },
  });

  const writeDone = (async () => {
    await proc.stdin.end();
  })();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
    writeDone,
  ]);

  // fzf abort (Esc / Ctrl+C): treat as cancel even if --print-query wrote text
  if (exitCode === 1 || exitCode === 130) return null;
  if (exitCode !== 0) {
    throw new Error(
      `fzf exited ${exitCode}: ${stderr.trim() || "(no stderr)"}`
    );
  }

  return queryFromFzfStdout(stdout);
}

/** First line of --print-query output, trimmed. Exported for tests. */
export function queryFromFzfStdout(stdout: string): string {
  return (stdout.split("\n")[0] ?? "").trim();
}
