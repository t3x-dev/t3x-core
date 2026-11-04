export interface T3xApiKey {
  id: string;
  key_prefix: string;
  name: string;
  project_id: string | null;
  namespace_id: string | null;
  principal_kind: 'human' | 'agent' | 'service';
  credential_kind: 'api_key' | 'pat' | 'mcp' | 'agent' | 'service';
  delegator_user_id: string | null;
  transition_scopes: string[];
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
}

export interface CreatedT3xApiKey {
  id: string;
  key: string;
  key_prefix: string;
  name: string;
  project_id: string | null;
  namespace_id: string | null;
  principal_kind: 'human' | 'agent' | 'service';
  credential_kind: 'api_key' | 'pat' | 'mcp' | 'agent' | 'service';
  delegator_user_id: string | null;
  transition_scopes: string[];
  expires_at: string | null;
  created_at: string;
}

export interface CreateT3xApiKeyInput {
  name: string;
  project_id?: string;
  namespace_id?: string;
  principal_kind?: 'human' | 'agent' | 'service';
  credential_kind?: 'api_key' | 'pat' | 'mcp' | 'agent' | 'service';
  transition_scopes?: string[];
  expires_at?: string;
}
