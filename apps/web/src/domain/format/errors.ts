const MISSING_RESOURCE_PATTERNS: Array<{
  label: string;
  patterns: RegExp[];
}> = [
  {
    label: 'project',
    patterns: [/\bPROJECT_NOT_FOUND\b/i, /\bproject(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'conversation',
    patterns: [/\bCONVERSATION_NOT_FOUND\b/i, /\bconversation(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'commit',
    patterns: [/\bCOMMIT_NOT_FOUND\b/i, /\bcommit(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'leaf',
    patterns: [/\bLEAF_NOT_FOUND\b/i, /\bleaf(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'source material',
    patterns: [/\bMATERIAL_NOT_FOUND\b/i, /\bmaterial(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'draft',
    patterns: [/\bDRAFT_NOT_FOUND\b/i, /\bdraft(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'merge',
    patterns: [/\bMERGE_NOT_FOUND\b/i, /\bmerge(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'template',
    patterns: [/\bTEMPLATE_NOT_FOUND\b/i, /\btemplate(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'comparison',
    patterns: [/\bCOMPARISON_NOT_FOUND\b/i, /\bcomparison(?:\s+\S+)?\s+not found\b/i],
  },
  {
    label: 'message',
    patterns: [/\bTURN_NOT_FOUND\b/i, /\bturn(?:\s+\S+)?\s+not found\b/i],
  },
];

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error == null) return '';
  return String(error);
}

function compact(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

export function formatUserFacingError(
  error: unknown,
  fallback = 'Something went wrong. Try again.'
): string {
  const message = compact(rawMessage(error));
  if (!message) return fallback;

  if (/\b(failed to fetch|networkerror|network request failed)\b/i.test(message)) {
    return 'Network request failed. Check your connection and try again.';
  }

  for (const resource of MISSING_RESOURCE_PATTERNS) {
    if (resource.patterns.some((pattern) => pattern.test(message))) {
      return `This ${resource.label} is no longer available.`;
    }
  }

  if (/^(?:HTTP\s*)?404\b/i.test(message) || /\b404\s+not found\b/i.test(message)) {
    return 'The requested resource is no longer available.';
  }

  return message;
}
