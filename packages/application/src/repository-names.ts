/** Application address policy. Never part of the Transition protocol. */
export const RESERVED_REPOSITORY_NAMES = ['new', 'settings'] as const;

export function inspectRepositoryName(input: string) {
  const name = input.trim().replace(/[^A-Za-z0-9._-]+/g, '-');
  const code =
    name.length === 0
      ? 'NAME_EMPTY'
      : name.length > 100
        ? 'NAME_TOO_LONG'
        : !/[A-Za-z0-9]/.test(name)
          ? 'NAME_REQUIRES_ALPHANUMERIC'
          : RESERVED_REPOSITORY_NAMES.some((word) => word === name.toLowerCase())
            ? 'NAME_RESERVED'
            : null;
  const messages = {
    NAME_EMPTY: 'Repository name is required.',
    NAME_TOO_LONG: 'Repository name must contain at most 100 characters.',
    NAME_REQUIRES_ALPHANUMERIC: 'Repository name must contain an ASCII letter or number.',
    NAME_RESERVED: 'This repository name is reserved for a system route.',
  };
  return {
    name,
    changed: name !== input,
    valid: code === null,
    code,
    message: code ? messages[code] : null,
  };
}
