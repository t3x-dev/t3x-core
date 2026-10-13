import type { TransitionProtocolValue } from '@t3x-dev/api-client';
import { describe, expect, it } from 'vitest';
import { composeObjectSlotEdits, composeSlotInput } from '@/domain/workspaces/composeObjectEditing';
import { applyDraftOpsToCurrent } from '@/domain/workspaces/manualStaging';

describe('object slot editing', () => {
  it('replays changed slots without touching object structure, siblings or unchanged values', () => {
    const object = {
      key: 'flight',
      slots: { goal: '开飞机的任务', done: true, count: 2, text: 'true', note: null },
      children: [{ key: 'step', slots: { title: 'Learn' }, children: [] }],
    };
    const sibling = { key: 'other', slots: { goal: 'Read' }, children: [] };
    const input = {
      goal: '学习开飞机',
      done: 'false',
      count: '3',
      text: 'true',
      note: 'null',
      added: 'ignored',
    };
    const edit = composeObjectSlotEdits('tasks/[key=flight]', object.slots, input);
    expect(edit.errors).toEqual({});
    expect(edit.operations).toHaveLength(3);
    const result = applyDraftOpsToCurrent({ tasks: [object, sibling] }, edit.operations);
    expect(result).toEqual({
      tasks: [
        { ...object, slots: { ...object.slots, goal: '学习开飞机', done: false, count: 3 } },
        sibling,
      ],
    });
    expect(object.slots.done).toBe(true);
  });

  it('preserves arrays, objects, null, empty strings and numeric-looking text', () => {
    const slots = {
      array: [1],
      object: { nested: true },
      nullable: null,
      text: '35',
      empty: 'old',
    };
    const edit = composeObjectSlotEdits('task', slots, {
      array: '[2, null]',
      object: '{"nested":false}',
      nullable: '{"value":1}',
      text: 'false',
      empty: '',
    });
    expect(edit.errors).toEqual({});
    expect(applyDraftOpsToCurrent({ task: { slots } }, edit.operations)).toEqual({
      task: {
        slots: {
          array: [2, null],
          object: { nested: false },
          nullable: { value: 1 },
          text: 'false',
          empty: '',
        },
      },
    });
  });

  it('ignores JSON formatting and mapping key order when the field value is unchanged', () => {
    const edit = composeObjectSlotEdits(
      'task',
      { config: { a: 1, b: 2 }, count: 3 },
      { config: '{"b":2,"a":1}', count: '3.0' }
    );
    expect(edit.operations).toEqual([]);
    expect(edit.changes).toEqual([]);
  });

  it('quotes slot names containing path separators and selector syntax', () => {
    const slots = { 'done/next': false, 'name"[key=x]': 'old' };
    const edit = composeObjectSlotEdits('task', slots, {
      'done/next': 'true',
      'name"[key=x]': 'new',
    });
    expect(edit.errors).toEqual({});
    expect(applyDraftOpsToCurrent({ task: { slots } }, edit.operations)).toEqual({
      task: { slots: { ...slots, 'done/next': true, 'name"[key=x]': 'new' } },
    });
  });

  it.each<[TransitionProtocolValue, string, string]>([
    [1, '', 'Enter a valid number.'],
    [1, 'Infinity', 'Enter a valid number.'],
    [true, 'yes', 'Choose True or False.'],
    [[1], '[', 'Enter valid JSON.'],
    [[1], '{}', 'Enter a JSON array.'],
    [{ value: 1 }, 'null', 'Enter a JSON object.'],
    [null, '1e999', 'JSON numbers must be finite.'],
    [{ value: 1 }, '{"value":1e999}', 'JSON numbers must be finite.'],
  ])('rejects invalid field input without generating an operation (%j)', (value, input, message) => {
    const edit = composeObjectSlotEdits('task', { value }, { value: input });
    expect(edit.operations).toEqual([]);
    expect(edit.errors.value).toBe(message);
  });

  it('formats strings without interpreting their content as JSON', () => {
    expect(composeSlotInput('true')).toBe('true');
    expect(composeSlotInput('35')).toBe('35');
  });
});
