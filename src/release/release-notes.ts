export const KEEP_A_CHANGELOG_FOOTER = `All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).`;

export function extractReleaseNotes(
  changelog: string,
  version: string
): string {
  const heading = new RegExp(`^## \\[${escapeRegex(version)}\\] - `, "m");
  const match = heading.exec(changelog);
  if (!match) {
    throw new Error(`Could not find CHANGELOG section for version ${version}.`);
  }

  const headingEnd = changelog.indexOf("\n", match.index);
  if (headingEnd === -1) {
    throw new Error(`CHANGELOG section for version ${version} is malformed.`);
  }

  const rest = changelog.slice(headingEnd + 1);
  const nextHeading = rest.search(/^## \[/m);
  const body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();

  if (!body) {
    throw new Error(`CHANGELOG section for version ${version} is empty.`);
  }

  const normalized = body.replace(/<kbd>([^<]+)<\/kbd>/g, "`$1`");
  return `${normalized}\n\n${KEEP_A_CHANGELOG_FOOTER}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
