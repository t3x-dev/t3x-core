type IntroDemoEnv = Partial<Record<'NEXT_PUBLIC_AUTH_DISABLED' | 'NODE_ENV', string>>;

export function isIntroDemoQueryEnabled(
  searchParams: Pick<URLSearchParams, 'get'>,
  env: IntroDemoEnv = process.env,
  nodeEnv = env.NODE_ENV
): boolean {
  if (searchParams.get('introDemo') !== '1') return false;
  if (nodeEnv !== 'production') return true;
  return env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
}
