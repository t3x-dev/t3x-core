const releaseBranchPattern = /^release\/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const hotfixBranchPattern = /^hotfix\/.+/;
const changesetsBranchPattern = /^changesets?-release\/main$/;
const productVersionPattern =
  /^T3X product release version:\s*`?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`?\s*$/im;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isChecked(body, label) {
  return new RegExp(`^- \\[[xX]\\] ${escapeRegex(label)}\\s*$`, 'm').test(body);
}

function sectionText(body, heading) {
  return (
    body.match(
      new RegExp(`^## ${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?:\\n## |\\n?$)`, 'm')
    )?.[1] ?? ''
  );
}

function hasNonEmptyBullet(section) {
  return section.split('\n').some((line) => /^-\s+\S/.test(line.trim()) && line.trim() !== '-');
}

function parseProductReleaseVersion(body) {
  return body.match(productVersionPattern)?.[1] ?? null;
}

function validateProductReleaseBody({ body, branchVersion = null }) {
  const errors = [];
  const version = parseProductReleaseVersion(body);

  if (!version) {
    errors.push('main release PRs must include "T3X product release version: `x.y.z`".');
  }

  if (branchVersion && version && version !== branchVersion) {
    errors.push(
      `release branch version ${branchVersion} does not match PR body product release version ${version}.`
    );
  }

  if (
    !body.includes('## Included Changes') ||
    !hasNonEmptyBullet(sectionText(body, 'Included Changes'))
  ) {
    errors.push('main release PRs must list at least one included change.');
  }

  if (
    !body.includes('## Release Notes') ||
    !hasNonEmptyBullet(sectionText(body, 'Release Notes'))
  ) {
    errors.push('main release PRs must include user-facing release notes.');
  }

  const noPackagePublish = isChecked(body, 'No package publish intended');
  const changesetsIncluded = isChecked(body, 'Changesets included for public package changes');

  if (noPackagePublish === changesetsIncluded) {
    errors.push(
      'main release PRs must check exactly one package intent: "No package publish intended" or "Changesets included for public package changes".'
    );
  }

  const localAffected = isChecked(body, '`@t3x-dev/local`');
  const yopsAffected = isChecked(body, '`@t3x-dev/yops`');
  const noneAffected = isChecked(body, 'None');
  const affectedCount = [localAffected, yopsAffected, noneAffected].filter(Boolean).length;

  if (affectedCount === 0) {
    errors.push('main release PRs must declare public packages affected, or check "None".');
  }

  if (noneAffected && (localAffected || yopsAffected)) {
    errors.push('public package impact cannot check "None" together with a package name.');
  }

  if ((localAffected || yopsAffected) && noPackagePublish) {
    errors.push(
      'public package changes require changesets; do not check "No package publish intended".'
    );
  }

  if (noneAffected && changesetsIncluded) {
    errors.push('package changesets are checked, but public packages affected is "None".');
  }

  return errors;
}

export function validateReleasePr({ baseBranch, headBranch, body = '' }) {
  const errors = [];

  if (!baseBranch || baseBranch !== 'main') {
    return { errors };
  }

  if (changesetsBranchPattern.test(headBranch)) {
    return { errors };
  }

  const releaseMatch = headBranch.match(releaseBranchPattern);
  const isHotfix = hotfixBranchPattern.test(headBranch);

  if (!releaseMatch && !isHotfix) {
    errors.push(
      'PRs targeting main must come from release/x.y.z, hotfix/*, or changeset-release/main.'
    );
    return { errors };
  }

  errors.push(
    ...validateProductReleaseBody({
      body,
      branchVersion: releaseMatch?.[1] ?? null,
    })
  );

  return { errors };
}
