'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CallBackProps, Step } from 'react-joyride';
import { showToast } from '@/components/Toast';
import { useTerminology } from '@/hooks/useTerminology';

// Dynamic import to avoid SSR issues with react-joyride
const Joyride = dynamic(() => import('react-joyride'), { ssr: false });

const TOUR_COMPLETED_KEY = 't3x-tour-completed';

function buildTourSteps(t: (key: string) => string): Step[] {
  return [
    {
      target: '[data-node-type="conversation"]',
      title: 'Conversations',
      content: 'This holds a conversation with AI. Double-click to explore the knowledge inside.',
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-node-type="commit"]',
      title: t('commits'),
      content: `Extracted knowledge becomes versioned ${t('commits').toLowerCase()} — semantic version control for meaning.`,
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-action="next-step"]',
      title: 'Take Action',
      content: `${t('branchAction')}, ${t('mergeAction').toLowerCase()}, or create outputs from any ${t('commit').toLowerCase()}.`,
      disableBeacon: true,
      placement: 'bottom',
    },
    {
      target: '[data-node-type="leaf"]',
      title: 'Leaves',
      content: 'Validated outputs — articles, emails, deployments — generated from your knowledge.',
      disableBeacon: true,
      placement: 'right',
    },
    {
      target: '[data-action="memory"]',
      title: 'Memory Context',
      content: 'Control which sources feed the LLM. Press \u2318K for quick actions.',
      disableBeacon: true,
      placement: 'bottom',
    },
  ];
}

// Tour tooltip styles using CSS variables
const tourStyles = {
  options: {
    arrowColor: 'var(--surface-elevated)',
    backgroundColor: 'var(--surface-elevated)',
    overlayColor: 'rgba(0, 0, 0, 0.5)',
    primaryColor: 'var(--accent-commit)',
    textColor: 'var(--text-primary)',
    zIndex: 1000,
  },
  tooltip: {
    borderRadius: '0.75rem',
    padding: '1rem',
    border: '1px solid var(--stroke-strong)',
    borderLeft: '2px solid var(--accent-commit)',
  },
  tooltipTitle: {
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  tooltipContent: {
    fontSize: '0.8125rem',
    lineHeight: 1.5,
  },
  buttonNext: {
    borderRadius: '0.5rem',
    fontSize: '0.8125rem',
    padding: '0.375rem 0.75rem',
  },
  buttonBack: {
    color: 'var(--text-tertiary)',
    fontSize: '0.8125rem',
  },
  buttonSkip: {
    color: 'var(--text-tertiary)',
    fontSize: '0.75rem',
  },
};

interface GuidedTourProps {
  /** Whether the canvas is ready (data loaded, fitView called) */
  ready: boolean;
}

export function GuidedTour({ ready }: GuidedTourProps) {
  const { t } = useTerminology();
  const tourSteps = useMemo(() => buildTourSteps(t), [t]);
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    const seen = localStorage.getItem('t3x-onboarding-seen') === 'true';
    // Only auto-start tour if onboarding was seen but tour not completed
    if (seen && !completed) {
      // Small delay to let canvas settle after fitView
      const timer = setTimeout(() => setRun(true), 500);
      return () => clearTimeout(timer);
    }
  }, [ready]);

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status } = data;
    if (status === 'finished' || status === 'skipped') {
      setRun(false);
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
      if (status === 'finished') {
        showToast("Tour complete! You're ready to explore.", 'success');
      }
    }
  }, []);

  return (
    <Joyride
      steps={tourSteps}
      run={run}
      continuous
      showSkipButton
      showProgress
      callback={handleCallback}
      styles={tourStyles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip tour',
      }}
    />
  );
}
