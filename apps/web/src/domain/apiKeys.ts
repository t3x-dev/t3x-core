export interface T3xApiKey {
  id: string;
  key_prefix: string;
  name: string;
  project_id: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface CreatedT3xApiKey {
  id: string;
  key: string;
  key_prefix: string;
  name: string;
  project_id: string | null;
  created_at: string;
}

export interface CreateT3xApiKeyInput {
  name: string;
  project_id?: string;
}
