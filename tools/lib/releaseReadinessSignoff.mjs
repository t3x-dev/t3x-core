export const SIGNOFF_MARKER = '<!-- t3x-release-readiness-signoff:v1 -->';

const KNOWN_ROW_IDS = new Set([
  'row-1',
  'row-2a',
  'row-2b',
  'row-2c',
  'row-3',
  'row-4',
  'row-5',
  'row-6',
  'row-7',
  'row-8',
]);

const TRUSTED_SIGNOFF_AUTHORS = new Set(['github-actions[bot]', 'github-actions']);
const RELEASE_OWNER_PATTERNS = [
  /^RELEASE\.md$/,
  /^STABILITY\.md$/,
  /^release(?:\/|$)/,
  /^\.github\/CODEOWNERS$/,
  /^\.github\/release-flow\.md$/,
  /^\.github\/workflows(?:\/|$|\*)/,
  /^docs\/release(?:\/|$)/,
  /^docs\/contributing\/branch-protection\.md$/,
  /^docs\/contributing\/pr-and-release-guards\.md$/,
];

export function parseReadinessCommand(body = '') {
  const commandLine = String(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('/t3x readiness'));

  if (!commandLine) {
    throw new Error(
      'Usage: /t3x readiness approve|block|clear <row-id> [reason]. No readiness command found.'
    );
  }

  const match = commandLine.match(/^\/t3x\s+readiness\s+(\S+)(?:\s+(\S+))?(?:\s+(.+))?$/);
  if (!match) {
    throw new Error('Usage: /t3x readiness approve|block|clear <row-id> [reason]');
  }

  const [, action, rowId, rawReason = ''] = match;
  if (!['approve', 'block', 'clear'].includes(action)) {
    throw new Error('Readiness action must be approve, block, or clear.');
  }

  if (!rowId) {
    throw new Error('Usage: /t3x readiness approve|block|clear <row-id> [reason]');
  }

  if (!KNOWN_ROW_IDS.has(rowId)) {
    throw new Error(`Readiness command must target a known row id, got ${rowId}.`);
  }

  const reason = rawReason.trim();
  if ((action === 'approve' || action === 'block') && reason.length === 0) {
    throw new Error(`Readiness ${action} commands require a reason.`);
  }

  return {
    action,
    row_id: rowId,
    reason: action === 'clear' ? '' : reason,
  };
}

export function applyReadinessSignoff({ state, command, author, owners, decidedAt }) {
  const normalizedAuthor = normalizeLogin(author);
  const ownerSet = new Set((owners ?? []).map(normalizeLogin).filter(Boolean));
  if (!normalizedAuthor || !ownerSet.has(normalizedAuthor)) {
    throw new Error(`${author || 'unknown author'} is not authorized to mutate readiness signoff.`);
  }

  const nextState = normalizeSignoffState(state);
  const decisions = nextState.decisions.filter((decision) => decision.row_id !== command.row_id);

  if (command.action !== 'clear') {
    decisions.push({
      row_id: command.row_id,
      decision: command.action,
      author,
      reason: command.reason,
      decided_at: decidedAt,
    });
  }

  return {
    schema_version: 1,
    decisions: decisions.sort((left, right) => left.row_id.localeCompare(right.row_id)),
  };
}

export function extractTrustedSignoffState(
  comments = [],
  { trustedAuthors = [...TRUSTED_SIGNOFF_AUTHORS] } = {}
) {
  const trustedAuthorSet = new Set(trustedAuthors.map(normalizeLogin));
  const trustedComments = comments
    .filter((comment) => trustedAuthorSet.has(normalizeLogin(comment?.user?.login)))
    .filter(
      (comment) => typeof comment?.body === 'string' && comment.body.includes(SIGNOFF_MARKER)
    );

  if (trustedComments.length === 0) {
    return emptySignoffState();
  }

  const latest = trustedComments.at(-1);
  return extractSignoffStateFromBody(latest.body);
}

export function extractSignoffStateFromBody(body = '') {
  const markerIndex = body.indexOf(SIGNOFF_MARKER);
  if (markerIndex < 0) {
    return emptySignoffState();
  }

  const markerBody = body.slice(markerIndex + SIGNOFF_MARKER.length);
  const jsonBlock = markerBody.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonBlock) {
    return emptySignoffState();
  }

  try {
    return normalizeSignoffState(JSON.parse(jsonBlock[1]));
  } catch {
    return emptySignoffState();
  }
}

export function renderSignoffStateComment(state) {
  const normalized = normalizeSignoffState(state);
  const rows =
    normalized.decisions.length === 0
      ? 'No owner decisions recorded.'
      : normalized.decisions
          .map(
            (decision) =>
              `- \`${decision.row_id}\`: ${decision.decision} by @${decision.author} - ${decision.reason}`
          )
          .join('\n');

  return `${SIGNOFF_MARKER}
# Release Readiness Owner Signoff

${rows}

\`\`\`json
${JSON.stringify(normalized, null, 2)}
\`\`\`
`;
}

export function readAuthorizedOwnersFromCodeowners(codeownersText = '') {
  const owners = [];
  for (const rawLine of codeownersText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const [pathPattern, ...tokens] = line.split(/\s+/);
    if (!isReleaseOwnerPathPattern(pathPattern)) {
      continue;
    }

    for (const token of tokens) {
      if (!token.startsWith('@') || token.includes('/')) {
        continue;
      }
      const owner = token.slice(1);
      if (owner && !owners.includes(owner)) {
        owners.push(owner);
      }
    }
  }

  return owners;
}

function isReleaseOwnerPathPattern(pathPattern) {
  const normalized = pathPattern.replace(/\\/g, '/');
  return RELEASE_OWNER_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function emptySignoffState() {
  return {
    schema_version: 1,
    decisions: [],
  };
}

function normalizeSignoffState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.decisions)) {
    return emptySignoffState();
  }

  return {
    schema_version: 1,
    decisions: state.decisions
      .filter((decision) => isValidDecision(decision))
      .map((decision) => ({
        row_id: decision.row_id,
        decision: decision.decision,
        author: decision.author,
        reason: decision.reason,
        decided_at: decision.decided_at,
      }))
      .sort((left, right) => left.row_id.localeCompare(right.row_id)),
  };
}

function isValidDecision(decision) {
  return (
    decision &&
    typeof decision === 'object' &&
    KNOWN_ROW_IDS.has(decision.row_id) &&
    ['approve', 'block'].includes(decision.decision) &&
    typeof decision.author === 'string' &&
    decision.author.length > 0 &&
    typeof decision.reason === 'string' &&
    decision.reason.length > 0 &&
    typeof decision.decided_at === 'string' &&
    decision.decided_at.length > 0
  );
}

function normalizeLogin(login) {
  return typeof login === 'string' ? login.trim().toLowerCase() : '';
}
