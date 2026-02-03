/**
 * Author Builder
 *
 * Builds CommitV3 author information for different environments.
 */

import * as os from 'node:os';
import type { CommitAuthor } from '../types/commit-v3';

/**
 * Get author information for local CLI usage.
 *
 * Uses T3X_AUTHOR_NAME environment variable if set,
 * otherwise falls back to OS username.
 *
 * @returns CommitAuthor with 'none' verification
 */
export function getLocalAuthor(): CommitAuthor {
  const name = process.env.T3X_AUTHOR_NAME || os.userInfo().username;
  return {
    name,
    identity: `local:${name}`,
    verification: 'none',
  };
}

/**
 * Get author information for Docker container environment.
 *
 * Uses container ID to generate a device-based identity.
 *
 * @param containerId - The Docker container ID
 * @returns CommitAuthor with 'device' verification
 */
export function getDockerAuthor(containerId: string): CommitAuthor {
  return {
    name: `container-${containerId.slice(0, 8)}`,
    identity: `device:${containerId}`,
    verification: 'device',
  };
}

/**
 * Get author information for web session.
 *
 * Uses session name and email for verified identity.
 *
 * @param session - Object containing user's name and email
 * @returns CommitAuthor with 'verified' verification
 */
export function getWebAuthor(session: { name: string; email: string }): CommitAuthor {
  return {
    name: session.name,
    identity: `email:${session.email}`,
    verification: 'verified',
  };
}
