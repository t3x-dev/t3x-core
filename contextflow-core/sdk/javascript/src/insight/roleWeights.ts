/**
 * Role weight lookup.
 */

export const defaultRoleWeights: Record<string, number> = {
  user: 1,
  tool: 0.9,
  assistant: 0.6,
  system: 0.5,
};

export function getRoleWeight(role?: string): number {
  if (!role) return 1;
  return defaultRoleWeights[role.toLowerCase()] ?? 1;
}

