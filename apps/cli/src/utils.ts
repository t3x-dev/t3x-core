/**
 * CLI Utilities
 */

import { createClient, type T3xClient } from '@t3x-dev/api-client';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';

export interface TableConfig {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Print a formatted table
 */
export function printTable({ columns, rows }: TableConfig): void {
  const data = [columns.map((c) => chalk.bold(c)), ...rows];
  console.log(table(data));
}

/**
 * Print a success message
 */
export function success(message: string): void {
  console.log(chalk.green('✓'), message);
}

/**
 * Print an error message
 */
export function error(message: string): void {
  console.error(chalk.red('✗'), message);
}

/**
 * Print a warning message
 */
export function warn(message: string): void {
  console.warn(chalk.yellow('⚠'), message);
}

/**
 * Print an info message
 */
export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Create a spinner
 */
export function createSpinner(text: string) {
  return ora({ text, spinner: 'dots' });
}

/**
 * Format a date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Get API URL from environment or default
 */
export function getApiUrl(): string {
  return process.env.T3X_API_URL || 'http://localhost:8000/api';
}

/**
 * Get API key from environment
 */
export function getApiKey(): string | undefined {
  return process.env.T3X_API_KEY;
}

/**
 * Create an API client with optional Bearer token auth
 */
export function getClientWithAuth(): T3xClient {
  const headers: Record<string, string> = {};
  const apiKey = getApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return createClient({ baseUrl: getApiUrl(), headers });
}

/**
 * Read all of stdin to a string
 */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}
