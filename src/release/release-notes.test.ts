import { describe, expect, it } from "bun:test";

import { extractReleaseNotes } from "./release-notes.ts";

const changelog = `# Changelog

## [0.4.0] - 2026-06-30

### Added

- New feature

### Changed

- Worktree flow now uses <kbd>Esc</kbd> from the picker

## [0.3.0] - 2026-06-29

### Added

- Older feature

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;

describe("extractReleaseNotes", () => {
  it("extracts the requested version section without the heading line", () => {
    const notes = extractReleaseNotes(changelog, "0.4.0");

    expect(notes).toContain("### Added");
    expect(notes).toContain("- New feature");
    expect(notes).toContain("### Changed");
    expect(notes).toContain("- Worktree flow now uses `Esc` from the picker");
    expect(notes).not.toContain("## [0.4.0]");
    expect(notes).not.toContain("2026-06-30");
    expect(notes).not.toContain("Older feature");
    expect(notes).toContain("Keep a Changelog");
  });

  it("throws when the version section is missing", () => {
    expect(() => extractReleaseNotes(changelog, "9.9.9")).toThrow(
      "Could not find CHANGELOG section for version 9.9.9."
    );
  });
});
