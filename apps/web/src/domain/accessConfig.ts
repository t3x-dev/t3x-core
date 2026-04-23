/**
 * L2 — shape of the local/shared access config wire payloads.
 *
 * These types describe the JSON bodies that `infrastructure/local-config`
 * reads and writes; keeping them in the domain layer lets components and
 * hooks consume them without crossing the L4 → L1 import boundary.
 */

export interface LocalConfigState {
  api_url: string;
  api_url_source: 'env' | 'file' | 'default';
  api_key_present: boolean;
  api_key_source: 'env' | 'file' | 'none';
  api_key_preview: string | null;
  config_path: string;
}

export interface UpdateLocalConfigInput {
  api_url?: string;
  api_key?: string;
}

export interface LocalAccessCheckResult {
  ok: boolean;
  code:
    | 'ACCESS_OK'
    | 'AUTH_NOT_REQUIRED'
    | 'MISSING_API_KEY'
    | 'INVALID_API_KEY'
    | 'API_UNREACHABLE'
    | 'API_ERROR';
  auth_mode: 'open' | 'protected' | 'unreachable';
  message: string;
  api_url: string;
  api_key_present: boolean;
  api_key_source: 'env' | 'file' | 'none';
  status_code: number | null;
}
