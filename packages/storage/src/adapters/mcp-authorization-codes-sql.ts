// Included in both fresh installations and the repository delegation migration.
export const MCP_AUTHORIZATION_CODES_SQL = `
  CREATE TABLE IF NOT EXISTS mcp_authorization_codes (
    code_hash TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL UNIQUE,
    approval_hash TEXT NOT NULL,
    nonce TEXT NOT NULL,
    redeemed BOOLEAN NOT NULL DEFAULT FALSE,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    resource TEXT NOT NULL,
    challenge TEXT NOT NULL,
    grant_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('read', 'prepare', 'commit')),
    encrypted_credential TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS mcp_authorization_codes_expiry ON mcp_authorization_codes(expires_at);
`;
