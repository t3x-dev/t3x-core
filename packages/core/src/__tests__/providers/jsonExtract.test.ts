import { describe, expect, it } from 'vitest';
import { extractJsonBlock } from '../../providers/llm/jsonExtract';

describe('extractJsonBlock', () => {
  it('returns bare JSON object verbatim', () => {
    expect(extractJsonBlock('{"a":1}')).toBe('{"a":1}');
  });

  it('returns bare JSON array verbatim', () => {
    expect(extractJsonBlock('[1,2,3]')).toBe('[1,2,3]');
  });

  it('trims leading/trailing whitespace', () => {
    expect(extractJsonBlock('  \n  {"a":1}  \n  ')).toBe('{"a":1}');
  });

  it('extracts JSON inside a ```json code fence', () => {
    expect(extractJsonBlock('Here is the draft:\n\n```json\n{"name":"Alice"}\n```\n\nDone.')).toBe(
      '{"name":"Alice"}'
    );
  });

  it('extracts JSON inside an unlabeled ``` code fence', () => {
    expect(extractJsonBlock('```\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it('extracts the first balanced object when JSON follows a preamble', () => {
    expect(extractJsonBlock('Sure — the result is {"a":1,"b":{"c":2}} thanks!')).toBe(
      '{"a":1,"b":{"c":2}}'
    );
  });

  it('returns null when no JSON-like structure exists', () => {
    expect(extractJsonBlock('just plain text')).toBeNull();
    expect(extractJsonBlock('')).toBeNull();
    expect(extractJsonBlock('   ')).toBeNull();
  });

  it('returns null when an unbalanced object opens but never closes', () => {
    expect(extractJsonBlock('preamble {"a": 1')).toBeNull();
  });
});
