#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertValidVersion,
  ensureChangelogRelease,
  updatePackageVersion,
  updatePluginManifestVersion,
} from "../../src/release/release.ts";

interface CliArgs {
  version?: string;
  date: string;
  dryRun: boolean;
}

const cwd = process.cwd();
const args = parseArgs(process.argv.slice(2));

if (!args.version) {
  console.error(
    "Usage: bun run release -- <version> [--date YYYY-MM-DD] [--dry-run]"
  );
  process.exit(1);
}

assertValidVersion(args.version);

const packagePath = join(cwd, "package.json");
const manifestPath = join(cwd, "herdr-plugin.toml");
const changelogPath = join(cwd, "CHANGELOG.md");

const packageNext = updatePackageVersion(
  readFileSync(packagePath, "utf-8"),
  args.version
);
const manifestNext = updatePluginManifestVersion(
  readFileSync(manifestPath, "utf-8"),
  args.version
);
const changelogNext = ensureChangelogRelease(
  readFileSync(changelogPath, "utf-8"),
  args.version,
  args.date
);

if (!args.dryRun) {
  writeFileSync(packagePath, packageNext, "utf-8");
  writeFileSync(manifestPath, manifestNext, "utf-8");
  writeFileSync(changelogPath, changelogNext, "utf-8");
}

console.log(
  `${args.dryRun ? "Would update" : "Updated"} package.json -> ${args.version}`
);
console.log(
  `${args.dryRun ? "Would update" : "Updated"} herdr-plugin.toml -> ${args.version}`
);
console.log(
  `${args.dryRun ? "Would ensure" : "Ensured"} CHANGELOG.md contains ## [${args.version}] - ${args.date}`
);

if (!args.dryRun) {
  console.log("Next: review CHANGELOG.md, run tests, commit, tag, and push.");
}

function parseArgs(argv: readonly string[]): CliArgs {
  let version: string | undefined;
  let date = new Date().toISOString().slice(0, 10);
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--date") {
      date = argv[index + 1] ?? date;
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!version) {
      version = arg;
    }
  }

  return { version, date, dryRun };
}
