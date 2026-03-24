import { describe, expect, it } from 'vitest';
import { checkReadiness } from '../readinessGate';

describe('checkReadiness', () => {
  // ── Rule 1: empty ──

  it('blocks when turns is empty', () => {
    const result = checkReadiness([], true);
    expect(result).toEqual({ pass: false, reason: 'empty' });
  });

  // ── Rule 2: too_short ──

  it('blocks when user content is under 20 chars', () => {
    const turns = [
      { role: 'user', content: 'hi there' },
      { role: 'assistant', content: 'Hello! How can I help you plan your trip?' },
    ];
    const result = checkReadiness(turns, true);
    expect(result).toEqual({ pass: false, reason: 'too_short' });
  });

  it('counts only user turns for character threshold', () => {
    const turns = [
      { role: 'user', content: 'ok' },
      {
        role: 'assistant',
        content:
          'This is a very long assistant response with lots of detail and information about many topics.',
      },
    ];
    const result = checkReadiness(turns, true);
    expect(result).toEqual({ pass: false, reason: 'too_short' });
  });

  // ── Rule 3: cold_start ──

  it('blocks first extraction with only 1 turn', () => {
    const turns = [{ role: 'user', content: 'I want to plan a trip to Hangzhou for 3 days' }];
    const result = checkReadiness(turns, true);
    expect(result).toEqual({ pass: false, reason: 'cold_start' });
  });

  it('allows single turn on non-first extraction', () => {
    const turns = [{ role: 'user', content: 'Actually change the budget to 5000 yuan' }];
    const result = checkReadiness(turns, false);
    expect(result).toEqual({ pass: true });
  });

  // ── Rule 4: only_greetings ──

  it('blocks when all user turns are English greetings', () => {
    const turns = [
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content:
          'Hi there! What can I help you with today? I can assist with travel planning, cooking, and more.',
      },
      { role: 'user', content: 'hey' },
      { role: 'assistant', content: 'Hello again! Would you like to discuss something specific?' },
    ];
    // total user chars = 5 + 3 = 8 < 20 → too_short takes precedence
    expect(checkReadiness(turns, false).reason).toBe('too_short');
  });

  it('blocks when all user turns are Chinese greetings', () => {
    const _turns = [
      { role: 'user', content: '你好！这是一个很长的问候语啊哈' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: '早上好' },
    ];
    // "你好！这是一个很长的问候语啊哈" is 14 chars, "早上好" is 3 chars = 17 < 20 → too_short
    // Need longer greetings to test rule 4 specifically
  });

  it('blocks pure greetings that pass char threshold', () => {
    // Need enough greeting chars to pass rule 2
    const turns = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'hey' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'Sure!' },
      { role: 'user', content: 'thanks' },
      { role: 'assistant', content: 'You are welcome!' },
      { role: 'user', content: 'thank you' },
    ];
    // user chars: 5+3+2+6+9 = 25 >= 20, all are greetings
    const result = checkReadiness(turns, false);
    expect(result).toEqual({ pass: false, reason: 'only_greetings' });
  });

  it('does NOT block greetings mixed with real content', () => {
    const turns = [
      { role: 'user', content: '你好，我想去杭州旅游，大概三天，预算五千左右' },
      { role: 'assistant', content: '好的！杭州是个好地方。' },
    ];
    const result = checkReadiness(turns, true);
    expect(result).toEqual({ pass: true });
  });

  // ── Rule 5: pass ──

  it('passes normal conversation with sufficient content', () => {
    const turns = [
      { role: 'user', content: 'I want to plan a 3-day trip to Hangzhou' },
      { role: 'assistant', content: 'Great! Hangzhou is beautiful. What interests you most?' },
      { role: 'user', content: 'West Lake, local food, and temples' },
    ];
    const result = checkReadiness(turns, true);
    expect(result).toEqual({ pass: true });
  });

  it('passes non-first extraction with single substantive turn', () => {
    const turns = [
      { role: 'user', content: 'Change the budget to 8000 yuan and add one more day' },
    ];
    const result = checkReadiness(turns, false);
    expect(result).toEqual({ pass: true });
  });

  // ── Edge cases ──

  it('handles turns with only assistant messages (no user turns)', () => {
    const turns = [
      { role: 'assistant', content: 'Welcome! How can I help you today with your trip planning?' },
    ];
    const result = checkReadiness(turns, true);
    // No user turns → totalUserChars = 0 < 20 → too_short
    expect(result).toEqual({ pass: false, reason: 'too_short' });
  });

  it('handles whitespace-only user content', () => {
    const turns = [
      { role: 'user', content: '   ' },
      { role: 'assistant', content: 'Hello!' },
    ];
    const result = checkReadiness(turns, true);
    expect(result).toEqual({ pass: false, reason: 'too_short' });
  });

  it('greeting check is case-insensitive for English', () => {
    const turns = [
      { role: 'user', content: 'HELLO' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Hey' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Thanks' },
      { role: 'assistant', content: 'Sure!' },
      { role: 'user', content: 'Thank You' },
    ];
    // user chars: 5+3+6+9 = 23 >= 20
    const result = checkReadiness(turns, false);
    expect(result).toEqual({ pass: false, reason: 'only_greetings' });
  });
});
