type WhichFn = (bin: string) => string | null | undefined;

export function resolveFzfBin(
  explicit?: string,
  which: WhichFn = Bun.which
): string {
  if (explicit) return explicit;

  const found = which("fzf");
  if (found) return found;

  throw new Error(fzfMissingMessage());
}

export function fzfMissingMessage(): string {
  return [
    "fzf is required for Sessionizer picker flows but was not found on PATH.",
    "Install it, then retry:",
    "  macOS: brew install fzf",
    "  Linux: install fzf with your distro's package manager",
    "  Docs: https://github.com/junegunn/fzf#installation",
  ].join("\n");
}
