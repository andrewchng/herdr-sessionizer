import { describe, expect, it } from "bun:test";

import {
  assertReadyToTagRelease,
  releaseTagName,
  readPackageVersion,
  readPluginManifestVersion,
} from "./release-tag.ts";

describe("releaseTagName", () => {
  it("prefixes release tags with v", () => {
    expect(releaseTagName("0.2.0")).toBe("v0.2.0");
  });
});

describe("readPackageVersion", () => {
  it("reads the package version field", () => {
    expect(
      readPackageVersion('{\n  "name": "pkg",\n  "version": "0.2.0"\n}\n')
    ).toBe("0.2.0");
  });
});

describe("readPluginManifestVersion", () => {
  it("reads the plugin manifest version field", () => {
    expect(
      readPluginManifestVersion('id = "sessionizer"\nversion = "0.2.0"\n')
    ).toBe("0.2.0");
  });
});

describe("assertReadyToTagRelease", () => {
  const readyState = {
    currentBranch: "main",
    workingTreeClean: true,
    packageVersion: "0.2.0",
    manifestVersion: "0.2.0",
    tagExists: false,
  } as const;

  it("accepts a clean main checkout with matching versions", () => {
    expect(() => assertReadyToTagRelease("0.2.0", readyState)).not.toThrow();
  });

  it("rejects non-main branches", () => {
    expect(() =>
      assertReadyToTagRelease("0.2.0", {
        ...readyState,
        currentBranch: "feature/release",
      })
    ).toThrow("Release tags must be created from main");
  });

  it("rejects dirty working trees", () => {
    expect(() =>
      assertReadyToTagRelease("0.2.0", {
        ...readyState,
        workingTreeClean: false,
      })
    ).toThrow("Release tags require a clean git working tree.");
  });

  it("rejects version mismatches", () => {
    expect(() =>
      assertReadyToTagRelease("0.2.0", {
        ...readyState,
        packageVersion: "0.1.0",
      })
    ).toThrow(
      "package.json version '0.1.0' does not match requested tag '0.2.0'."
    );
    expect(() =>
      assertReadyToTagRelease("0.2.0", {
        ...readyState,
        manifestVersion: "0.1.0",
      })
    ).toThrow(
      "herdr-plugin.toml version '0.1.0' does not match requested tag '0.2.0'."
    );
  });

  it("rejects existing tags", () => {
    expect(() =>
      assertReadyToTagRelease("0.2.0", { ...readyState, tagExists: true })
    ).toThrow("Git tag 'v0.2.0' already exists.");
  });
});
