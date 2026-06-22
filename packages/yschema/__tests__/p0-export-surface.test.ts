import { describe, expect, it } from 'vitest';
import * as yschema from '../src/index';

describe('YSchema public export surface', () => {
  it('exposes only the P0 runtime API', () => {
    expect(Object.keys(yschema).sort()).toEqual([
      'generatePromptContract',
      'normalizeYSchemaObject',
      'parseYSchema',
      'renderYSchemaMarkdown',
      't3xPrdP0Fixtures',
      'validateTree',
    ]);
  });
});
