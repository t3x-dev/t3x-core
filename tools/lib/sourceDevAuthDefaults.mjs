const DEV_TARGET_FILTERS = {
  api: 't3x-api-server',
  webui: 't3x-webui',
};

const SOURCE_DEV_DEFAULTS = {
  AUTH_DISABLED: 'true',
};

const WEBUI_SOURCE_DEV_DEFAULTS = {
  NEXT_PUBLIC_API_URL: 'http://localhost:8000',
};

export function applySourceDevDefaults(target, env) {
  const nextEnv = { ...env };

  if (nextEnv.AUTH_DISABLED === undefined) {
    nextEnv.AUTH_DISABLED = SOURCE_DEV_DEFAULTS.AUTH_DISABLED;
  }

  if (target === 'webui' && nextEnv.NEXT_PUBLIC_API_URL === undefined) {
    nextEnv.NEXT_PUBLIC_API_URL = WEBUI_SOURCE_DEV_DEFAULTS.NEXT_PUBLIC_API_URL;
  }

  return nextEnv;
}

export function getDevTargetFilter(target) {
  const filter = DEV_TARGET_FILTERS[target];

  if (filter === undefined) {
    throw new Error('Unknown dev target');
  }

  return filter;
}
