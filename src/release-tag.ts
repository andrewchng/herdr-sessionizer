import { assertValidVersion } from "./release.ts";

export interface ReleaseTagState {
  currentBranch: string;
  workingTreeClean: boolean;
  packageVersion: string;
  manifestVersion: string;
  tagExists: boolean;
}

export function readPackageVersion(packageJson: string): string {
  const parsed = JSON.parse(packageJson) as { version?: unknown };
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error("Could not find package.json version field.");
  }

  return parsed.version;
}

export function readPluginManifestVersion(manifest: string): string {
  const match = manifest.match(/^version = "(.*)"$/m);
  if (!match?.[1]) {
    throw new Error("Could not find plugin manifest version field.");
  }

  return match[1];
}

export function assertReadyToTagRelease(
  version: string,
  state: ReleaseTagState
): void {
  assertValidVersion(version);

  if (state.currentBranch !== "main") {
    throw new Error(
      `Release tags must be created from main, found '${state.currentBranch}'.`
    );
  }

  if (!state.workingTreeClean) {
    throw new Error("Release tags require a clean git working tree.");
  }

  if (state.packageVersion !== version) {
    throw new Error(
      `package.json version '${state.packageVersion}' does not match requested tag '${version}'.`
    );
  }

  if (state.manifestVersion !== version) {
    throw new Error(
      `herdr-plugin.toml version '${state.manifestVersion}' does not match requested tag '${version}'.`
    );
  }

  if (state.tagExists) {
    throw new Error(`Git tag '${version}' already exists.`);
  }
}
