import { describe, expect, it } from 'vitest';
import {
  getChangedContentLineNumbers,
  getChangedLineNumbers,
  getHumanCommentContentLineNumbers,
} from '@/domain/yops/scriptDiff';

describe('scriptDiff', () => {
  it('finds inserted and edited current lines', () => {
    expect(getChangedLineNumbers('a\nb\nc\n', 'a\nB\nx\nc\n')).toEqual([2, 3]);
  });

  it('keeps post-Apply highlighting to changed YAML content lines', () => {
    const before = ['yops:', '  - set:', '      path: trip/dest', '      value: HZ', ''].join('\n');
    const after = [
      'yops:',
      '  # Human edit via YOps: manual change by alice',
      '  - set:',
      '      path: trip/dest',
      '      value: Shanghai',
      '',
    ].join('\n');

    expect(getChangedContentLineNumbers(before, after)).toEqual([5]);
  });

  it('finds content lines under human edit comments', () => {
    const script = [
      'yops:',
      '  - set:',
      '      path: trip/dest',
      '      value: HZ',
      '  # Human edit via Inline: manual change by alice',
      '  - set:',
      '      path: trip/dest',
      '      value: Shanghai',
      '',
    ].join('\n');

    expect(getHumanCommentContentLineNumbers(script)).toEqual([7, 8]);
  });
});
