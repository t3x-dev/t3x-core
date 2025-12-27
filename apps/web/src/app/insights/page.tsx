'use client';

import { Clock3, Lightbulb } from 'lucide-react';
import { SemanticCard } from '@/components/SemanticCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { boardColumns, semanticFeed, timeline } from '@/data/sampleLedger';
import { cn } from '@/lib/utils';

const stageColors = {
  commit: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  draft: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  turn: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
} as const;

export default function InsightsPage() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <header className="flex items-center gap-3">
        <Lightbulb className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
      </header>

      <Tabs defaultValue="ledger" className="flex-1">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="latest">Latest Commits</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="mt-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Ledger</h2>
            <p className="text-sm text-muted-foreground">
              Semantic turns, drafts, and commits from the ledger.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {semanticFeed.map((entry) => (
              <SemanticCard key={entry.id} entry={entry} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="latest" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            {/* Timeline */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Latest Commits</CardTitle>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" /> Updated live
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {timeline.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px] uppercase',
                        stageColors[item.stage as keyof typeof stageColors]
                      )}
                    >
                      {item.stage}
                    </Badge>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-medium leading-tight">{item.label}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Status Board */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(boardColumns).map(([column, entries]) => (
                <Card key={column}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">{column}</CardTitle>
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {entries.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-md border p-2.5 transition-colors hover:bg-muted/50"
                      >
                        <p className="font-medium text-sm leading-tight">{entry.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {entry.summary}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'mt-2 text-[10px]',
                            stageColors[entry.stage as keyof typeof stageColors]
                          )}
                        >
                          {entry.status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
