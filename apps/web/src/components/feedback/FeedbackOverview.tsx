'use client';

import { Card, CardContent } from '@/components/ui/card';

interface FeedbackOverviewProps {
  stats: {
    total: number;
    accept_rate: number;
    edit_rate: number;
    reject_rate: number;
  };
}

export function FeedbackOverview({ stats }: FeedbackOverviewProps) {
  const cards = [
    {
      label: 'Accept Rate',
      value: stats.accept_rate,
      colorClass: 'text-emerald-600',
    },
    {
      label: 'Edit Rate',
      value: stats.edit_rate,
      colorClass: 'text-blue-600',
    },
    {
      label: 'Reject Rate',
      value: stats.reject_rate,
      colorClass: 'text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="py-4">
            <p className={`text-3xl font-bold ${card.colorClass}`}>
              {(card.value * 100).toFixed(1)}%
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">{card.label}</p>
            <p className="text-xs text-[var(--text-tertiary)]">of {stats.total} total</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
