const DEV_TARGET_FILTERS = {
  api: 't3x-api-server',
  webui: 't3x-webui',
};

export function applySourceDevAuthDefault(env) {
  if (env.AUTH_DISABLED !== undefined) {
    return { ...env };
  }

  return {
    ...env,
    AUTH_DISABLED: 'true',
  };
}

export function getDevTargetFilter(target) {
  const filter = DEV_TARGET_FILTERS[target];

  if (filter === undefined) {
    throw new Error('Unknown dev target');
  }

  return filter;
}
