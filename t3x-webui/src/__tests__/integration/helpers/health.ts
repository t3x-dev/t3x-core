/**
 * Health Check Helper
 *
 * Waits for the server to be ready before running tests.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 1000;

export async function waitForHealth(baseUrl = BASE_URL): Promise<boolean> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          console.log(`[health] Server ready after ${i + 1} attempt(s)`);
          return true;
        }
      }
    } catch {
      // Server not ready yet
    }

    if (i < MAX_RETRIES - 1) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw new Error(`Server not ready after ${MAX_RETRIES} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
