import { describe, expect, it } from 'vitest';
import {
  createDownloadProgressReporter,
  formatBytes,
  formatDownloadStatus,
  parseContentLength,
} from '../scripts/download-progress.mjs';

function createOutput({ tty }) {
  return {
    isTTY: tty,
    writes: [],
    write(chunk) {
      this.writes.push(String(chunk));
      return true;
    },
  };
}

describe('download progress formatting', () => {
  it('formats byte sizes with binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB');
  });

  it('parses usable Content-Length values', () => {
    expect(parseContentLength('1024')).toBe(1024);
    expect(parseContentLength(' 1024 ')).toBe(1024);
    expect(parseContentLength('0')).toBeNull();
    expect(parseContentLength('not-a-number')).toBeNull();
    expect(parseContentLength('1024x')).toBeNull();
    expect(parseContentLength(null)).toBeNull();
  });

  it('includes percent, downloaded bytes, total bytes, and rate when total is known', () => {
    expect(
      formatDownloadStatus({
        downloadedBytes: 5 * 1024 * 1024,
        totalBytes: 10 * 1024 * 1024,
        elapsedMs: 5000,
      })
    ).toBe('50% | 5.0 MiB / 10.0 MiB | 1.0 MiB/s');
  });

  it('omits percent and total when content length is unknown', () => {
    expect(
      formatDownloadStatus({
        downloadedBytes: 1536,
        totalBytes: null,
        elapsedMs: 1000,
      })
    ).toBe('1.5 KiB downloaded | 1.5 KiB/s');
  });
});

describe('download progress reporter', () => {
  it('renders TTY progress on one line and finishes with a summary', () => {
    let now = 0;
    const output = createOutput({ tty: true });
    const reporter = createDownloadProgressReporter({
      fileName: 'runtime.tgz',
      totalBytes: 10 * 1024,
      output,
      now: () => now,
      minIntervalMs: 100,
    });

    reporter.start();
    now = 1000;
    reporter.tick(5 * 1024);
    now = 2000;
    reporter.tick(5 * 1024);
    reporter.finish();

    const joined = output.writes.join('');
    expect(joined).toContain('Downloading runtime.tgz (10.0 KiB)');
    expect(joined).toContain('\r[t3x-local:postinstall] Downloading runtime.tgz: 50%');
    expect(joined).toContain('\r[t3x-local:postinstall] Downloading runtime.tgz: 100%');
    expect(joined).toContain('\n[t3x-local:postinstall] Downloaded runtime.tgz: 10.0 KiB in 2.0s');
  });

  it('uses throttled line logs for non-TTY output', () => {
    let now = 0;
    const output = createOutput({ tty: false });
    const reporter = createDownloadProgressReporter({
      fileName: 'runtime.tgz',
      totalBytes: 100,
      output,
      now: () => now,
      minIntervalMs: 500,
    });

    reporter.start();
    now = 100;
    reporter.tick(25);
    now = 600;
    reporter.tick(25);
    now = 1200;
    reporter.tick(50);
    reporter.finish();

    const lines = output.writes.join('').trim().split('\n');
    expect(lines).toEqual([
      '[t3x-local:postinstall] Downloading runtime.tgz (100 B)...',
      '[t3x-local:postinstall] Downloading runtime.tgz: 50% | 50 B / 100 B | 83 B/s',
      '[t3x-local:postinstall] Downloading runtime.tgz: 100% | 100 B / 100 B | 83 B/s',
      '[t3x-local:postinstall] Downloaded runtime.tgz: 100 B in 1.2s (83 B/s).',
    ]);
  });

  it('terminates an in-place TTY progress line before retry logging', () => {
    let now = 0;
    const output = createOutput({ tty: true });
    const reporter = createDownloadProgressReporter({
      fileName: 'runtime.tgz',
      totalBytes: 100,
      output,
      now: () => now,
      minIntervalMs: 100,
    });

    reporter.start();
    now = 1000;
    reporter.tick(50);
    reporter.fail();

    expect(output.writes.join('').endsWith('\n')).toBe(true);
  });

  it('uses a custom log prefix when provided', () => {
    const output = createOutput({ tty: false });
    const reporter = createDownloadProgressReporter({
      fileName: 'runtime.tgz',
      totalBytes: 100,
      output,
      now: () => 0,
      prefix: 't3x-local:setup',
    });

    reporter.start();

    expect(output.writes.join('')).toBe('[t3x-local:setup] Downloading runtime.tgz (100 B)...\n');
  });
});
