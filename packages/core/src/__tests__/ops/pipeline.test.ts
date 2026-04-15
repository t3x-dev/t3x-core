import { describe, expect, it } from 'vitest';
import { collectResult, runOperation } from '../../ops/pipeline';
import type { Operation, OpsPipelineContext, PipelineEvent } from '../../ops/types';

const stubCtx: OpsPipelineContext = {
  db: null,
  projectId: 'proj_test',
};

describe('runOperation', () => {
  it('wraps operation with op_start and op_done events', async () => {
    const op: Operation<string, string> = {
      name: 'echo',
      // biome-ignore lint/correctness/useYield: test intentionally returns without yielding
      async *run(input) {
        return input;
      },
    };

    const gen = runOperation(op, 'hello', stubCtx);
    const events: PipelineEvent[] = [];
    let result: IteratorResult<PipelineEvent, string>;
    do {
      result = await gen.next();
      if (!result.done) events.push(result.value);
    } while (!result.done);

    expect(events.length).toBe(2);
    expect(events[0].type).toBe('op_start');
    expect(events[0].op).toBe('echo');
    expect(events[0].timestamp).toBeTypeOf('number');
    expect(events[1].type).toBe('op_done');
    expect(events[1].op).toBe('echo');
    expect(result.value).toBe('hello');
  });

  it('yields op_error on failure and re-throws', async () => {
    const op: Operation<void, never> = {
      name: 'fail',
      // biome-ignore lint/correctness/useYield: test intentionally throws before yielding
      async *run() {
        throw new Error('boom');
      },
    };

    const gen = runOperation(op, undefined, stubCtx);
    const events: PipelineEvent[] = [];

    // First event: op_start
    const first = await gen.next();
    expect(first.done).toBe(false);
    events.push(first.value as PipelineEvent);

    // Second call yields op_error event
    const second = await gen.next();
    expect(second.done).toBe(false);
    const errorEvent = second.value as PipelineEvent;
    expect(errorEvent.type).toBe('op_error');
    expect(errorEvent.op).toBe('fail');
    expect(errorEvent.error).toBeInstanceOf(Error);

    // Third call re-throws the error
    await expect(gen.next()).rejects.toThrow('boom');
  });

  it('passes through step events from the operation', async () => {
    const op: Operation<number, number> = {
      name: 'multi-step',
      async *run(input) {
        yield { type: 'step_start', step: 'step1' };
        const doubled = input * 2;
        yield { type: 'step_done', step: 'step1', data: doubled };
        return doubled;
      },
    };

    const gen = runOperation(op, 5, stubCtx);
    const events: PipelineEvent[] = [];
    let result: IteratorResult<PipelineEvent, number>;
    do {
      result = await gen.next();
      if (!result.done) events.push(result.value);
    } while (!result.done);

    expect(events.map((e) => e.type)).toEqual(['op_start', 'step_start', 'step_done', 'op_done']);
    expect(events[1].step).toBe('step1');
    expect(events[2].data).toBe(10);
    expect(result.value).toBe(10);
  });
});

describe('collectResult', () => {
  it('consumes generator and returns final value', async () => {
    const op: Operation<string, string> = {
      name: 'upper',
      // biome-ignore lint/correctness/useYield: test intentionally returns without yielding
      async *run(input) {
        return input.toUpperCase();
      },
    };

    const result = await collectResult(runOperation(op, 'hello', stubCtx));
    expect(result).toBe('HELLO');
  });

  it('works with operations that yield many events', async () => {
    const op: Operation<number, number> = {
      name: 'sum-steps',
      async *run(input) {
        let acc = 0;
        for (let i = 1; i <= input; i++) {
          yield { type: 'step_start', step: `add-${i}` };
          acc += i;
          yield { type: 'step_done', step: `add-${i}`, data: acc };
        }
        return acc;
      },
    };

    const result = await collectResult(runOperation(op, 4, stubCtx));
    // 1+2+3+4 = 10
    expect(result).toBe(10);
  });
});
