#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertReadyToTagRelease,
  releaseTagName,
  readPackageVersion,
  readPluginManifestVersion,
} from "../src/release-tag.ts";

interface CliArgs {
  version?: string;
  dryRun: boolean;
}

const cwd = process.cwd();
const args = parseArgs(process.argv.slice(2));

if (!args.version) {
  console.error("Usage: bun run release:tag -- <version> [--dry-run]");
  process.exit(1);
}

const packagePath = join(cwd, "package.json");
const manifestPath = join(cwd, "herdr-plugin.toml");
const tagName = releaseTagName(args.version);
const packageVersion = readPackageVersion(readFileSync(packagePath, "utf-8"));
const manifestVersion = readPluginManifestVersion(
  readFileSync(manifestPath, "utf-8")
);
const currentBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
const workingTreeClean = runGit(["status", "--porcelain"]) === "";
const tagExists = runGitAllowFailure([
  "rev-parse",
  "-q",
  "--verify",
  `refs/tags/${tagName}`,
]).ok;

assertReadyToTagRelease(args.version, {
  currentBranch,
  workingTreeClean,
  packageVersion,
  manifestVersion,
  tagExists,
});

if (args.dryRun) {
  console.log(`Would create annotated tag ${tagName} from ${currentBranch}`);
  console.log(`Would push tag ${tagName} to origin`);
  process.exit(0);
}

runGit(["tag", "-a", tagName, "-m", `Release ${args.version}`]);
runGit(["push", "origin", tagName]);

console.log(`Created and pushed annotated tag ${tagName}`);

function parseArgs(argv: readonly string[]): CliArgs {
  let version: string | undefined;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (!version) {
      version = arg;
    }
  }

  return { version, dryRun };
}

function runGit(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(
      stderr ||
        `git ${args.join(" ")} failed with exit code ${result.exitCode}.`
    );
  }

  return result.stdout.toString().trim();
}

function runGitAllowFailure(args: readonly string[]): {
  ok: boolean;
  output: string;
} {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    ok: result.exitCode === 0,
    output: result.stdout.toString().trim(),
  };
}
