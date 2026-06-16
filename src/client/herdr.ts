import { HerdrError } from './errors.ts';

export class Herdr {
  private readonly bin: string;

  constructor(bin: string = process.env.HERDR_BIN_PATH ?? 'herdr') {
    this.bin = bin;
  }

  async run(args: readonly string[]): Promise<void> {
    await this.#exec(args);
  }

  async json<T>(args: readonly string[]): Promise<T> {
    const stdout = await this.#exec(args);
    return JSON.parse(stdout) as T;
  }

  async #exec(args: readonly string[]): Promise<string> {
    const proc = Bun.spawn([this.bin, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new HerdrError(args, exitCode, stderr.trim());
    }

    return stdout;
  }
}
