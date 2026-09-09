import { z } from 'zod';

export const DEPLOYMENT_CAPABILITIES_VERSION = 1 as const;

export const AuthOperationSchema = z.enum(['register', 'sign_in', 'sign_out']);
export const AccountOperationSchema = z.enum(['read', 'update', 'export', 'delete']);
export type AuthOperation = z.infer<typeof AuthOperationSchema>;
export type AccountOperation = z.infer<typeof AccountOperationSchema>;

/**
 * Public, deployment-scoped capabilities. This contract must never contain
 * actor-specific entitlements, balances, memberships, or private project data.
 */
export const DeploymentCapabilitiesSchema = z
  .object({
    version: z.literal(DEPLOYMENT_CAPABILITIES_VERSION),
    deployment_mode: z.enum(['self_hosted', 'managed', 'unavailable']),
    provider_credentials: z
      .object({
        administration: z.enum(['local', 'disabled']),
      })
      .strict(),
    inference: z
      .object({
        mode: z.enum(['direct', 'managed', 'unavailable']),
      })
      .strict(),
    identity: z
      .object({
        mode: z.enum(['local', 'managed', 'none']),
        auth_operations: z.array(AuthOperationSchema),
        account_operations: z.array(AccountOperationSchema),
        namespaces: z.boolean(),
      })
      .strict(),
    usage: z
      .object({
        mode: z.enum(['none', 'telemetry', 'credits']),
      })
      .strict(),
    ui_extensions: z
      .object({
        account: z.boolean(),
        billing: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type DeploymentCapabilities = z.infer<typeof DeploymentCapabilitiesSchema>;

export const SELF_HOSTED_DEPLOYMENT_CAPABILITIES: DeploymentCapabilities = {
  version: DEPLOYMENT_CAPABILITIES_VERSION,
  deployment_mode: 'self_hosted',
  provider_credentials: { administration: 'local' },
  inference: { mode: 'direct' },
  identity: {
    mode: 'local',
    auth_operations: ['register', 'sign_in', 'sign_out'],
    account_operations: ['read', 'update'],
    namespaces: true,
  },
  usage: { mode: 'telemetry' },
  ui_extensions: { account: true, billing: false },
};

export const UNAVAILABLE_DEPLOYMENT_CAPABILITIES: DeploymentCapabilities = {
  version: DEPLOYMENT_CAPABILITIES_VERSION,
  deployment_mode: 'unavailable',
  provider_credentials: { administration: 'disabled' },
  inference: { mode: 'unavailable' },
  identity: {
    mode: 'none',
    auth_operations: [],
    account_operations: [],
    namespaces: false,
  },
  usage: { mode: 'none' },
  ui_extensions: { account: false, billing: false },
};
