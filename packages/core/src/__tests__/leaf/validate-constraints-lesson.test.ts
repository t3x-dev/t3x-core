import { describe, expect, it } from 'vitest';
import { validateConstraintsExactOnly } from '../../leaf/validate-constraints';
import type { Constraint } from '../../types';

describe('validate-constraints lesson generation', () => {
  it('includes lesson field on failed assertions', () => {
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'hello world' },
    ];
    const result = validateConstraintsExactOnly('no match here', constraints);
    const failedAssertion = result.assertions.find((a) => !a.passed);
    expect(failedAssertion).toBeDefined();
    expect(failedAssertion!.lesson).toBe('Output must include exact text: "hello world"');
  });

  it('does not include lesson field on passed assertions', () => {
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'require', match_mode: 'exact', value: 'hello' },
    ];
    const result = validateConstraintsExactOnly('hello', constraints);
    const passedAssertion = result.assertions.find((a) => a.passed);
    expect(passedAssertion).toBeDefined();
    expect(passedAssertion!.lesson).toBeUndefined();
  });

  it('includes lesson with reason for exclude constraints', () => {
    const constraints: Constraint[] = [
      { id: 'cst_1', type: 'exclude', match_mode: 'exact', value: 'bad word', reason: 'policy' },
    ];
    const result = validateConstraintsExactOnly('this has bad word in it', constraints);
    const failedAssertion = result.assertions.find((a) => !a.passed);
    expect(failedAssertion).toBeDefined();
    expect(failedAssertion!.lesson).toBe('Output must NOT contain: "bad word" (reason: policy)');
  });
});
