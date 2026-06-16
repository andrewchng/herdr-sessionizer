export class HerdrError extends Error {
  constructor(
    public readonly args: readonly string[],
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(
      stderr
        ? `herdr ${args.join(' ')} failed (exit ${exitCode}): ${stderr}`
        : `herdr ${args.join(' ')} failed (exit ${exitCode})`,
    );
    this.name = 'HerdrError';
  }
}
