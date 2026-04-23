export interface WaitForHttpOptions {
  label: string;
  timeoutMs?: number;
  intervalMs?: number;
}

export interface HttpHealthResult {
  ok: boolean;
  details: string;
}

export async function waitForHttpOk(url: string, options: WaitForHttpOptions): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const intervalMs = options.intervalMs ?? 500;
  const startedAt = Date.now();
  let lastError: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `${options.label} did not become healthy at ${url} within ${timeoutMs}ms` +
      (lastError ? ` (last error: ${lastError})` : '')
  );
}

export async function checkHttpHealth(url: string, timeoutMs = 2000): Promise<HttpHealthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      details: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
