import { describe, expect, it } from 'vitest';
import { isExplicitWorkspaceChangeRequest } from '../lib/workspace-assistant/policy';

describe('isExplicitWorkspaceChangeRequest', () => {
  it('keeps short replies and ordinary questions on the conversation path', () => {
    expect(isExplicitWorkspaceChangeRequest('1')).toBe(false);
    expect(isExplicitWorkspaceChangeRequest('What is the current replica count?')).toBe(false);
    expect(isExplicitWorkspaceChangeRequest('Explain the current Draft.')).toBe(false);
    expect(
      isExplicitWorkspaceChangeRequest(
        'Summarize the current Draft in ten numbered points and add three review questions.'
      )
    ).toBe(false);
    expect(
      isExplicitWorkspaceChangeRequest(
        'Explain the current Draft in eight points. Do not create or modify a proposal.'
      )
    ).toBe(false);
    expect(isExplicitWorkspaceChangeRequest('解释当前 Draft，不要修改任何内容')).toBe(false);
  });

  it('recognizes explicit English and Chinese change requests', () => {
    expect(
      isExplicitWorkspaceChangeRequest(
        'Update the existing checkout-api requirement from 24 replicas to 26.'
      )
    ).toBe(true);
    expect(isExplicitWorkspaceChangeRequest('把 checkout-api 的副本数从 24 修改成 26')).toBe(true);
    expect(
      isExplicitWorkspaceChangeRequest(
        'Service checkout-api currently has replicas 24 改成 Service checkout-api currently has replicas 26'
      )
    ).toBe(true);
  });
});
