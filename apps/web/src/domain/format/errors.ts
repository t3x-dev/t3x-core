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

function rawCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function compact(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

export function formatUserFacingError(
  error: unknown,
  fallback = 'Something went wrong. Try again.'
): string {
  const message = compact(rawMessage(error));
  const code = rawCode(error);

  if (code === 'PROVIDER_KEY_MISSING') {
    return 'No provider key is configured. Open Provider settings and connect OpenAI, Anthropic, or Google.';
  }

  if (code === 'AUTH_ERROR') {
    return 'Provider key was rejected. Open Provider settings, update or remove the key, then test it again.';
  }

  if (code === 'RATE_LIMITED') {
    return 'Provider rate limit reached. Wait a moment or choose a different configured provider.';
  }

  if (code === 'PROVIDER_UNAVAILABLE') {
    return 'Provider is unavailable. Try again later or choose another configured provider.';
  }

  if (!message) return fallback;

  if (/\b(failed to fetch|networkerror|network request failed)\b/i.test(message)) {
    return 'Network request failed. Check your connection and try again.';
  }

  if (/\b(api key not configured|no configured .*provider|provider key missing)\b/i.test(message)) {
    return 'No provider key is configured. Open Provider settings and connect OpenAI, Anthropic, or Google.';
  }

  if (
    /\b(unauthorized|authentication failed|invalid api key|invalid key|forbidden)\b/i.test(
      message
    ) &&
    /\b(provider|api key|key)\b/i.test(message)
  ) {
    return 'Provider key was rejected. Open Provider settings, update or remove the key, then test it again.';
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
