import { describe, expect, it } from 'vitest';
import { expandComposeActivityCards } from '@/domain/composeActivity';
import {
  composeNodeContent,
  composeNodeTitle,
  composeValueChangeLabels,
} from '@/domain/composePresentation';

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
    expect(composeNodeContent(cards[0].after)).toBeUndefined();
    expect(composeValueChangeLabels(undefined, cards[0].after)).toEqual({
      before: 'Absent',
      after: '天气为晴天',
    });
    expect(JSON.stringify(card)).toBe(original);
  });

  it('expands a populated root into its own fields and independent child cards', () => {
    const root = {
      ...content.trees[0],
      slots: { problem: 'Late alerts', audience: 'Operators', outcome: 'Prompt detection' },
      children: [
        {
          key: 'requirements',
          slots: {},
          children: [
            requirement,
            {
              ...requirement,
              key: 'temperature',
              slots: { title: 'Temperature', acceptance: ['Below 18'] },
            },
          ],
        },
        {
          key: 'monitoring_ready',
          slots: { title: 'Monitoring ready', sequence: 1 },
          children: [],
        },
      ],
    };
    const card = { nodeId: 'root', path: 'content', after: { trees: [root], relations: [] } };
    const original = JSON.stringify(card);
    const expanded = expandComposeActivityCards([card]);
    expect(expanded).toHaveLength(6);
    expect(expanded.map((item) => item.path)).toContain('content/trees/[key=prd]/slots/problem');
    expect(expanded.map((item) => composeNodeTitle(item.after))).toContain('Temperature');
    expect(JSON.stringify(card)).toBe(original);
    const removed = expandComposeActivityCards([
      { nodeId: 'root', path: 'content', before: card.after },
    ]);
    expect(removed).toHaveLength(6);
    expect(removed.every((item) => item.after === undefined)).toBe(true);
  });

  it('keeps a requirement title separate from its saved content', () => {
    const before = { key: 'temperature', slots: { title: '气温' }, children: [] };
    const after = {
      key: 'temperature',
      slots: { title: '气温', priority: 'should', acceptance: ['低于30度'] },
      children: [],
    };
    expect(composeNodeContent(after)).toBe('低于30度');
    expect(composeValueChangeLabels(before, after)).toEqual({
      before: 'No content recorded',
      after: '低于30度',
    });
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
