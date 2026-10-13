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

  it('keeps root slots in one object row and gives each changed child its own row', () => {
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
    const paths = [
      'content/trees/[key=prd]',
      'content/trees/[key=prd]/children/[key=requirements]/children/[key=req_weather_qingtian]',
      'content/trees/[key=prd]/children/[key=requirements]/children/[key=temperature]',
      'content/trees/[key=prd]/children/[key=monitoring_ready]',
    ];
    expect(expanded.map((item) => item.path)).toEqual(paths);
    expect(expanded.map((item) => item.after)).toEqual([
      root,
      requirement,
      root.children[0].children[1],
      root.children[1],
    ]);
    expect(expanded.every((item) => item.nodeId === card.nodeId)).toBe(true);
    expect(expanded.every((item) => item.before === undefined)).toBe(true);
    expect(JSON.stringify(card)).toBe(original);
    const removed = expandComposeActivityCards([
      { nodeId: 'root', path: 'content', before: card.after },
    ]);
    expect(removed.map((item) => item.path)).toEqual(paths);
    expect(removed.map((item) => item.before)).toEqual(expanded.map((item) => item.after));
    expect(removed.every((item) => item.after === undefined)).toBe(true);
    expect(JSON.stringify(card)).toBe(original);
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

  it('shows object and relation changes separately without losing either or their source', () => {
    const card = {
      nodeId: 'n',
      path: 'content',
      after: { ...content, relations: [{ from: 'a', to: 'b' }] },
    };
    const original = JSON.stringify(card);
    const expanded = expandComposeActivityCards([card]);
    expect(expanded).toHaveLength(2);
    expect(expanded[0]).toMatchObject({
      nodeId: card.nodeId,
      path: 'content/trees/[key=prd]/children/[key=requirements]/children/[key=req_weather_qingtian]',
      after: requirement,
      objectChange: { sources: [card] },
    });
    expect(expanded[1]).toMatchObject({
      nodeId: card.nodeId,
      path: 'content/relations',
      after: card.after.relations,
      sourceCards: [card],
    });
    expect(expanded.every((item) => item.before === undefined)).toBe(true);
    expect(JSON.stringify(card)).toBe(original);
  });
});
