export function assertValidVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Version must be in x.y.z format, received '${version}'.`);
  }
}

export function updatePackageVersion(
  packageJson: string,
  version: string
): string {
  const parsed = JSON.parse(packageJson) as Record<string, unknown>;
  parsed.version = version;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updatePluginManifestVersion(
  manifest: string,
  version: string
): string {
  if (!/^version = ".*"$/m.test(manifest)) {
    throw new Error("Could not find plugin manifest version field.");
  }

  return manifest.replace(/^version = ".*"$/m, `version = "${version}"`);
}

export function ensureChangelogRelease(
  changelog: string,
  version: string,
  date: string
): string {
  const heading = `## [${version}] - ${date}`;
  if (
    changelog.includes(heading) ||
    new RegExp(`^## \\[${escapeRegex(version)}\\] - `, "m").test(changelog)
  ) {
    return changelog;
  }

  const lines = changelog.split("\n");
  let insertAt = 0;
  while (insertAt < lines.length && lines[insertAt] !== "") {
    insertAt += 1;
  }
  while (insertAt < lines.length && lines[insertAt] === "") {
    insertAt += 1;
  }

  const section = [heading, "", "### Added", "", "- TBD", ""];

  const next = [
    ...lines.slice(0, insertAt),
    ...section,
    ...lines.slice(insertAt),
  ].join("\n");
  return next.endsWith("\n") ? next : `${next}\n`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
