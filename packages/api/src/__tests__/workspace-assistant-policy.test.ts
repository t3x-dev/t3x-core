import { describe, expect, it } from 'vitest';
import { isExplicitWorkspaceChangeRequest } from '../lib/workspace-assistant/policy';

describe('isExplicitWorkspaceChangeRequest', () => {
  it('recognizes natural card creation without requiring proposal terminology', () => {
    for (const text of [
      '生成一个新的卡片,或者说标题,天气为晴天',
      '帮我生成一张新卡片，天气为晴天',
      '创建一个节点：天气为晴天',
      '新建一条需求：天气为晴天',
      '新建1个卡片天气为晴天',
      '新建 １ 个卡片天气为晴天',
      '帮我创建两张卡片',
      '按 PRD 结构把这张卡片作为一个新条目添加进去。',
      '把天气为晴天加到需求里面',
      '我想新增一条需求：天气为晴天',
      '麻烦你把标题改为天气为晴天',
      '这个节点补充一下验收条件',
      'Could you add a card titled Sunny weather?',
      'Generate 2 new cards',
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
      '不要按 PRD 结构把这张卡片添加进去',
      '不要新建1个卡片天气为晴天',
      '先不修改标题',
      '解释如何把天气添加到需求里',
      '如果把标题改为天气会怎样？',
      '为什么新建1个卡片没有成功？',
      'How can you add a new card?',
      'Could you explain how to create a card?',
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
