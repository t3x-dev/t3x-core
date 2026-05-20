export interface CommitHashReveal {
  full: string;
  compact: string;
  prefix: string | null;
}

export function formatCommitHashForReveal(hash: string, compactLength = 12): CommitHashReveal {
  const separatorIndex = hash.indexOf(':');
  if (separatorIndex === -1) {
    return {
      full: hash,
      compact: hash.slice(0, compactLength),
      prefix: null,
    };
  }

  const prefix = hash.slice(0, separatorIndex);
  const value = hash.slice(separatorIndex + 1);
  return {
    full: hash,
    compact: value.slice(0, compactLength),
    prefix,
  };
}
