const DEFAULT_MIN_INTERVAL_MS = 1000;
const PRODUCT_TAGLINE = 'Version control for structured state.';

export function parseContentLength(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) return `${Math.round(value)} ${units[unitIndex]}`;
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatElapsed(elapsedMs) {
  const seconds = Math.max(elapsedMs / 1000, 0);
  return `${seconds.toFixed(1)}s`;
}

function formatRate(downloadedBytes, elapsedMs) {
  const seconds = Math.max(elapsedMs / 1000, 0.001);
  return `${formatBytes(downloadedBytes / seconds)}/s`;
}

export function formatDownloadStatus({ downloadedBytes, totalBytes, elapsedMs }) {
  const rate = formatRate(downloadedBytes, elapsedMs);
  if (!totalBytes) {
    return `${formatBytes(downloadedBytes)} downloaded | ${rate}`;
  }

  const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
  return `${percent}% | ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} | ${rate}`;
}

export function formatDownloadBrandHeader({
  packageVersion = '0.0.0',
  prefix = 't3x-local:postinstall',
} = {}) {
  return `[${prefix}] T3X Local v${packageVersion} - ${PRODUCT_TAGLINE}`;
}

export function formatRuntimeInstallPlan({
  fileName = 'runtime archive',
  platformKey = 'unknown',
  prefix = 't3x-local:postinstall',
} = {}) {
  return [
    `[${prefix}] Runtime platform: ${platformKey}`,
    `[${prefix}] Runtime asset: ${fileName}`,
    `[${prefix}] Connecting to runtime download...`,
  ];
}

export function formatRuntimeDownloadFailureHint({
  fileName = 'runtime archive',
  mirrorDir = './t3x-local-runtime-mirror',
  packageSpecifier = '<package.tgz-or-@t3x-dev/local>',
  prefix = 't3x-local:postinstall',
  source = '<runtime-download-url>',
} = {}) {
  const mirrorFilePath = `${mirrorDir.replace(/\/+$/, '')}/${fileName}`;
  return [
    `[${prefix}] Runtime download did not complete.`,
    `[${prefix}] If GitHub is slow or blocked, download the runtime archive once and reinstall with T3X_LOCAL_RUNTIME_MIRROR.`,
    `[${prefix}] mkdir -p ${shellQuote(mirrorDir)}`,
    `[${prefix}] curl -L --retry 5 --retry-delay 3 --connect-timeout 30 --continue-at - -o ${shellQuote(mirrorFilePath)} ${shellQuote(source)}`,
    `[${prefix}] T3X_LOCAL_RUNTIME_MIRROR=${shellQuote(mirrorDir)} npm install ${shellQuote(packageSpecifier)} --foreground-scripts --no-audit --no-fund`,
  ];
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) {
    return text;
  }

  return `'${text.replaceAll("'", "'\\''")}'`;
}

export function createDownloadProgressReporter({
  fileName,
  totalBytes,
  prefix = 't3x-local:postinstall',
  output = process.stdout,
  now = Date.now,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
} = {}) {
  const isTTY = output.isTTY === true;
  const label = fileName || 'runtime archive';
  const startedAt = now();
  let downloadedBytes = 0;
  let lastRenderedAt = startedAt;
  let lastRenderedBytes = -1;
  let started = false;
  let lastLineWasProgress = false;

  function write(message) {
    output.write(message);
  }

  function renderProgress(force = false) {
    if (!started) return;
    const current = now();
    if (force && lastRenderedBytes === downloadedBytes) return;
    if (!force && current - lastRenderedAt < minIntervalMs) return;
    lastRenderedAt = current;
    lastRenderedBytes = downloadedBytes;
    const status = formatDownloadStatus({
      downloadedBytes,
      totalBytes,
      elapsedMs: current - startedAt,
    });
    const line = `[${prefix}] Downloading ${label}: ${status}`;

    if (isTTY) {
      write(`\r${line}`);
      lastLineWasProgress = true;
      return;
    }

    write(`${line}\n`);
  }

  return {
    start() {
      if (started) return;
      started = true;
      const size = totalBytes ? ` (${formatBytes(totalBytes)})` : '';
      write(`[${prefix}] Downloading ${label}${size}...\n`);
    },

    tick(chunkBytes) {
      downloadedBytes += chunkBytes;
      renderProgress(false);
    },

    finish() {
      if (!started) return;
      renderProgress(true);
      const elapsedMs = now() - startedAt;
      const summary = `[${prefix}] Downloaded ${label}: ${formatBytes(downloadedBytes)} in ${formatElapsed(elapsedMs)} (${formatRate(downloadedBytes, elapsedMs)}).`;
      write(`${isTTY && lastLineWasProgress ? '\n' : ''}${summary}\n`);
    },

    fail() {
      if (isTTY && lastLineWasProgress) {
        write('\n');
        lastLineWasProgress = false;
      }
    },
  };
}
