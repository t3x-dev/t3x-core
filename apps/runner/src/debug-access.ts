export function isEnabledEnv(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const normalizedHost = host.replace(/:\d+$/, '').toLowerCase();
  return (
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1' ||
    normalizedHost === '[::1]'
  );
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalizedAddress = address.toLowerCase();
  return (
    normalizedAddress === '127.0.0.1' ||
    normalizedAddress === '::1' ||
    normalizedAddress === '::ffff:127.0.0.1'
  );
}

export function isTrustedLoopbackRequest(args: {
  host: string | undefined;
  remoteAddress: string | undefined;
}): boolean {
  return isLoopbackHost(args.host) && isLoopbackAddress(args.remoteAddress);
}
