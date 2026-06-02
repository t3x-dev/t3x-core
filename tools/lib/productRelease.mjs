export function extractSection(markdown, heading) {
  return (
    markdown
      .match(new RegExp(`(?:^|\\n)## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1]
      ?.trim() ?? ''
  );
}

export function parseProductReleaseVersion(markdown) {
  return (
    markdown.match(
      /^T3X product release version:\s*`?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`?\s*$/im
    )?.[1] ?? null
  );
}

export function findProductReleasePull(pulls) {
  return (
    pulls.find(
      (pull) =>
        pull?.base?.ref === 'main' &&
        (pull?.head?.ref?.startsWith('release/') || pull?.head?.ref?.startsWith('hotfix/')) &&
        parseProductReleaseVersion(pull.body ?? '')
    ) ?? null
  );
}

export function buildProductReleaseNotes({ pull, version }) {
  const includedChanges = extractSection(pull.body ?? '', 'Included Changes');
  const packageReleases = extractSection(pull.body ?? '', 'Package Releases');
  const releaseNotes = extractSection(pull.body ?? '', 'Release Notes');
  const lines = [`# T3X v${version}`, ''];

  if (releaseNotes) {
    lines.push('## Release Notes', '', releaseNotes, '');
  }

  if (packageReleases) {
    lines.push('## Package Releases', '', packageReleases, '');
  }

  if (includedChanges) {
    lines.push('## Included Changes', '', includedChanges, '');
  }

  lines.push('## Source', '', `- PR: #${pull.number} ${pull.html_url ?? ''}`.trim());

  return lines.join('\n');
}
