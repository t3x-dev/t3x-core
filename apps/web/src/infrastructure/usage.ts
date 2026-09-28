import { API_V1, fetchWithTimeout, handleResponse } from './core';

export interface UsageSummaryRow {
  period: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface UsageModelRow {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface UsageDashboardData {
  summary: UsageSummaryRow[];
  total: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
  by_model: UsageModelRow[];
}

export async function getUsageDashboard(
  from: Date,
  to: Date,
  signal?: AbortSignal
): Promise<UsageDashboardData> {
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    group_by: 'day',
  });
  const response = await fetchWithTimeout(`${API_V1}/usage?${query}`, undefined, 10_000, signal);
  return handleResponse<UsageDashboardData>(response);
}
