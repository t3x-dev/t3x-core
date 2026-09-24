import { describe, expect, it } from 'vitest';
import { isExplicitWorkspaceChangeRequest } from '../lib/workspace-assistant/policy';

describe('isExplicitWorkspaceChangeRequest', () => {
  it('recognizes natural card creation without requiring proposal terminology', () => {
    for (const text of [
      '生成一个新的卡片,或者说标题,天气为晴天',
      '帮我生成一张新卡片，天气为晴天',
      '创建一个节点：天气为晴天',
      '新建一条需求：天气为晴天',
      'Generate a new card titled Sunny weather',
    ])
      expect(isExplicitWorkspaceChangeRequest(text)).toBe(true);
    for (const text of [
      '不要生成新的卡片',
      'Do not generate a new card',
      '生成一段说明，解释当前卡片',
      '如何生成一个新的卡片？',
      '好的',
      '使用中文',
    ])
      expect(isExplicitWorkspaceChangeRequest(text)).toBe(false);
  });
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
