import { describe, expect, it } from "bun:test";

import {
  assertValidVersion,
  ensureChangelogRelease,
  updatePackageVersion,
  updatePluginManifestVersion,
} from "./release.ts";

describe("assertValidVersion", () => {
  it("accepts semantic versions in x.y.z format", () => {
    expect(() => assertValidVersion("1.2.3")).not.toThrow();
  });

  it("rejects non-semver versions", () => {
    expect(() => assertValidVersion("v1.2.3")).toThrow(
      "Version must be in x.y.z format"
    );
  });
});

describe("updatePackageVersion", () => {
  it("updates the package version field", () => {
    const next = updatePackageVersion(
      '{\n  "name": "pkg",\n  "version": "0.1.0"\n}\n',
      "0.2.0"
    );
    expect(next).toContain('"version": "0.2.0"');
  });
});

describe("updatePluginManifestVersion", () => {
  it("updates the plugin manifest version field", () => {
    const next = updatePluginManifestVersion(
      'id = "sessionizer"\nversion = "0.1.0"\n',
      "0.2.0"
    );
    expect(next).toBe('id = "sessionizer"\nversion = "0.2.0"\n');
  });
});

describe("ensureChangelogRelease", () => {
  it("inserts a new release section after the changelog preamble", () => {
    const next = ensureChangelogRelease(
      "# Changelog\n\nAll notable changes.\n\n## [0.1.0] - 2026-06-23\n",
      "0.2.0",
      "2026-06-25"
    );
    expect(next).toContain("## [0.2.0] - 2026-06-25");
    expect(next).toContain("### Added");
  });

  it("does not duplicate an existing release section", () => {
    const initial = "# Changelog\n\n## [0.2.0] - 2026-06-25\n";
    expect(ensureChangelogRelease(initial, "0.2.0", "2026-06-25")).toBe(
      initial
    );
  });
});
