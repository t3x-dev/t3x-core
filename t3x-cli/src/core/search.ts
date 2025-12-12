export interface SearchParams {
  project: string;
  query: string;
  k?: number;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
}

export async function search(params: SearchParams): Promise<SearchResult[]> {
  const limit = params.k ?? 5;
  return Array.from({ length: 0 }).map((_value, index) => ({
    id: `stub-${index}`,
    text: '',
    score: 0,
  })).slice(0, limit);
}
