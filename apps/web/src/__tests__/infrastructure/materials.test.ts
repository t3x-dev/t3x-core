import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeoutMock = vi.fn();
const handleResponseMock = vi.fn();

vi.mock('@/infrastructure/core', () => ({
  API_V1: 'https://api.test/api/v1',
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
  handleResponse: (...args: unknown[]) => handleResponseMock(...args),
}));

import { listMaterialsByProject, uploadDocumentMaterial } from '@/infrastructure/materials';

describe('infrastructure/materials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads encoded project materials', async () => {
    const response = new Response('{}');
    const materials = [
      {
        id: 'mat_1',
        project_id: 'proj/with space',
        source_type: 'document',
        title: 'Notes',
        filename: 'notes.txt',
        mime_type: 'text/plain',
        content_hash: 'abc',
        content_excerpt: 'hello',
        token_estimate: 2,
        metadata: {},
        created_at: '2026-05-26T00:00:00.000Z',
        created_by: null,
      },
    ];

    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce(materials);

    await expect(listMaterialsByProject('proj/with space')).resolves.toBe(materials);

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj%2Fwith%20space/materials'
    );
    expect(handleResponseMock).toHaveBeenCalledWith(response);
  });

  it('uploads document materials with multipart form data', async () => {
    const response = new Response('{}');
    const material = {
      id: 'mat_2',
      project_id: 'proj_1',
      source_type: 'document',
      title: 'source.txt',
      filename: 'source.txt',
      mime_type: 'text/plain',
      content_hash: 'abc',
      content_excerpt: 'source',
      token_estimate: 2,
      metadata: {},
      created_at: '2026-05-26T00:00:00.000Z',
      created_by: null,
    };
    const file = new File(['source'], 'source.txt', { type: 'text/plain' });

    fetchWithTimeoutMock.mockResolvedValueOnce(response);
    handleResponseMock.mockResolvedValueOnce(material);

    await expect(uploadDocumentMaterial('proj_1', file)).resolves.toBe(material);

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/projects/proj_1/materials/document',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );
    const form = fetchWithTimeoutMock.mock.calls[0][1].body as FormData;
    expect(form.get('file')).toBe(file);
    expect(handleResponseMock).toHaveBeenCalledWith(response);
  });
});
