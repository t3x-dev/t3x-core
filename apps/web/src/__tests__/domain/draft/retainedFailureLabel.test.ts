import { describe, expect, it } from 'vitest';
import {
  formatAppliedResultFailureRow,
  formatApplyTooltipForRetainedFailure,
  formatRetainedFailureContext,
  formatRetainedFailureRow,
  getResultPanelHeaderLabel,
} from '@/domain/draft/retainedFailureLabel';

describe('formatRetainedFailureContext', () => {
  it('joins provider, model and capitalised preset with a center dot separator', () => {
    expect(
      formatRetainedFailureContext({
        message: 'irrelevant',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        preset: 'concise',
      })
    ).toBe('openai · gpt-5.4-mini · Concise');
  });

  it('drops missing fields silently rather than rendering placeholders', () => {
    // Reading the tests: "if provider+preset are known but model is
    // not, render only what's known". Substituting "unknown" or
    // "default" was rejected up-front because the persistent row
    // already includes the failure message.
    expect(
      formatRetainedFailureContext({
        message: 'm',
        provider: 'openai',
        preset: 'detailed',
      })
    ).toBe('openai · Detailed');
  });

  it('returns an empty string when no context fields are populated', () => {
    expect(formatRetainedFailureContext({ message: 'm' })).toBe('');
  });
});

describe('formatRetainedFailureRow', () => {
  it('renders the full context-aware sentence the panel header band shows', () => {
    expect(
      formatRetainedFailureRow({
        message: 'Extraction could not verify 1 slot(s) against the conversation.',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        preset: 'concise',
      })
    ).toBe(
      'Last extract failed (openai · gpt-5.4-mini · Concise): Extraction could not verify 1 slot(s) against the conversation. Previous draft retained.'
    );
  });

  it('omits the parenthesised context when no fields are known', () => {
    // The fallback covers the catch-block-fires-before-provider-resolved
    // race in useExtraction. The "Previous draft retained" tail still
    // anchors what the user gets to do next.
    expect(formatRetainedFailureRow({ message: 'LLM call failed.' })).toBe(
      'Last extract failed: LLM call failed. Previous draft retained.'
    );
  });
});

describe('formatAppliedResultFailureRow', () => {
  it('states that the applied result is unchanged when a re-extract fails without a staged draft', () => {
    expect(
      formatAppliedResultFailureRow({
        message: 'Extraction returned ops that do not form a valid tree update.',
        provider: 'google',
        model: 'gemini-3-flash-preview',
        preset: 'concise',
      })
    ).toBe(
      'Last extract failed (google · gemini-3-flash-preview · Concise): Extraction returned ops that do not form a valid tree update. Applied result unchanged.'
    );
  });
});

describe('formatApplyTooltipForRetainedFailure', () => {
  it('explicitly tells the user Apply will commit the previous draft', () => {
    // Without this string the Apply button would still read "Apply the
    // script to the tree" after a failed re-extract — which lets the
    // user click thinking they're applying the new attempt, then end
    // up applying the previous one. The bracketed context disambiguates
    // which attempt was the failed one.
    expect(
      formatApplyTooltipForRetainedFailure({
        message: 'm',
        provider: 'openai',
        model: 'gpt-5.4-mini',
        preset: 'concise',
      })
    ).toBe('Apply previous draft (latest openai · gpt-5.4-mini · Concise attempt failed)');
  });

  it('still distinguishes attempts when no context is known', () => {
    expect(formatApplyTooltipForRetainedFailure({ message: 'm' })).toBe(
      'Apply previous draft (latest attempt failed)'
    );
  });
});

describe('getResultPanelHeaderLabel', () => {
  // Four-state label (Output / Inherited baseline / Draft preview / Previous draft)
  // factored out of AfterPanel JSX so the precedence — retained-failure
  // wins over draft, draft wins over inherited baseline, inherited
  // baseline wins over applied — is locked in one place.
  it('returns "Output" in the steady state with no draft staged', () => {
    expect(getResultPanelHeaderLabel({ hasDraft: false, hasRetainedFailure: false })).toBe(
      'Output'
    );
  });

  it('returns "Inherited baseline" when only a parent commit baseline is visible', () => {
    expect(
      getResultPanelHeaderLabel({
        hasDraft: false,
        hasRetainedFailure: false,
        isInheritedBaselineOnly: true,
      })
    ).toBe('Inherited baseline');
  });

  it('returns "Draft preview" when a draft is staged from a successful extract', () => {
    expect(getResultPanelHeaderLabel({ hasDraft: true, hasRetainedFailure: false })).toBe(
      'Draft preview'
    );
  });

  it('returns "Previous draft" when a retained failure rides alongside the draft', () => {
    // The combination is what AfterPanel reads as "render the prior
    // proposal + show the retained-failure error row + flip the Apply
    // tooltip". Without the precedence here, a re-extract failure with
    // a still-staged draft would label as "Draft preview" and the
    // user couldn't tell the latest attempt failed.
    expect(getResultPanelHeaderLabel({ hasDraft: true, hasRetainedFailure: true })).toBe(
      'Previous draft'
    );
  });

  it('ignores a stray hasRetainedFailure flag when no draft is staged', () => {
    // Defensive: hasRetainedFailure should never be true with hasDraft
    // false (the store wires it that way), but if a code path ever
    // produces that combination, fall back to the steady-state label
    // rather than rendering "Previous draft" against a committed tree.
    expect(getResultPanelHeaderLabel({ hasDraft: false, hasRetainedFailure: true })).toBe('Output');
  });
});
