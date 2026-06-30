#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractReleaseNotes } from "../../src/release/release-notes.ts";

interface CliArgs {
  version?: string;
  changelogPath: string;
}

const cwd = process.cwd();
const args = parseArgs(process.argv.slice(2));

if (!args.version) {
  console.error("Usage: bun run release:notes -- <version> [--changelog PATH]");
  process.exit(1);
}

const changelog = readFileSync(args.changelogPath, "utf-8");
const notes = extractReleaseNotes(changelog, args.version);
process.stdout.write(`${notes}\n`);

function parseArgs(argv: readonly string[]): CliArgs {
  let version: string | undefined;
  let changelogPath = join(cwd, "CHANGELOG.md");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--changelog") {
      changelogPath = argv[index + 1] ?? changelogPath;
      index += 1;
      continue;
    }
    if (!version) {
      version = arg;
    }
  }

  return { version, changelogPath };
}
