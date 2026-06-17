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

export async function pick<T extends string>(
  rows: readonly T[],
  options: PickOptions = {},
): Promise<T[] | null> {
  if (rows.length === 0) return null;

  const bin = options.bin ?? Bun.which('fzf') ?? 'fzf';
  const args: string[] = [bin];
  if (options.prompt) args.push('--prompt', options.prompt);
  if (options.header) args.push('--header', options.header);
  if (options.multi) args.push('--multi');
  if (options.delimiter) args.push('--delimiter', options.delimiter);
  if (options.withNth) args.push('--with-nth', options.withNth);
  if (options.preview) args.push('--preview', options.preview);
  if (options.previewWindow) args.push('--preview-window', options.previewWindow);

  const proc = Bun.spawn(args, {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...options.env },
  });

  const input = new TextEncoder().encode(rows.join('\n') + '\n');
  const writeDone = (async () => {
    proc.stdin.write(input);
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
    throw new Error(`fzf exited ${exitCode}: ${stderr.trim() || '(no stderr)'}`);
  }

  const lines = stdout.split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) return null;
  return lines as T[];
}
