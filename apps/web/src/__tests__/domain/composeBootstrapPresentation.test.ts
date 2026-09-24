import { describe, expect, it } from 'vitest';
import { expandComposeActivityCards } from '@/domain/composeActivity';
import { composeNodeTitle, composeValueChangeLabels } from '@/domain/composePresentation';

describe('Compose bootstrap presentation', () => {
  const requirement = { key: 'req_weather_qingtian', slots: { title: '天气为晴天' }, children: [] };
  const content = {
    relations: [],
    trees: [
      {
        key: 'prd',
        slots: {},
        children: [{ key: 'requirements', slots: {}, children: [requirement] }],
      },
    ],
  };

  it('exposes the requirement from the first bootstrap action without mutating its identity or data', () => {
    const card = { nodeId: 'node:content@1:2', path: 'content', after: content };
    const original = JSON.stringify(card);
    const cards = expandComposeActivityCards([card]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      nodeId: card.nodeId,
      path: 'content/trees/[key=prd]/children/[key=requirements]/children/[key=req_weather_qingtian]',
      after: requirement,
    });
    expect(composeNodeTitle(cards[0].after)).toBe('天气为晴天');
    expect(composeValueChangeLabels(undefined, cards[0].after)).toEqual({
      before: 'Absent',
      after: '天气为晴天',
    });
    expect(JSON.stringify(card)).toBe(original);
  });

  it('handles removal and multiple siblings without dropping requirements', () => {
    const second = { ...requirement, key: 'second', slots: { title: '第二条' } };
    expect(
      expandComposeActivityCards([{ nodeId: 'n', path: 'children', after: [requirement, second] }])
    ).toHaveLength(2);
    const removed = expandComposeActivityCards([{ nodeId: 'n', path: 'content', before: content }]);
    expect(removed[0].after).toBeUndefined();
    expect(composeNodeTitle(removed[0].before)).toBe('天气为晴天');
  });

  it('keeps content with relation changes visible instead of silently hiding them', () => {
    const card = {
      nodeId: 'n',
      path: 'content',
      after: { ...content, relations: [{ from: 'a', to: 'b' }] },
    };
    expect(expandComposeActivityCards([card])).toEqual([card]);
  });
});
