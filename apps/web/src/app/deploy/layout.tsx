'use client';

import { AlertCircle, CheckCircle, Loader2, Rocket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { checkRunnerHealth } from '@/lib/api';

interface DeployLayoutProps {
  children: React.ReactNode;
}

export default function DeployLayout({ children }: DeployLayoutProps) {
  const [runnerHealthy, setRunnerHealthy] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkHealth() {
      try {
        const health = await checkRunnerHealth();
        setRunnerHealthy(health.status === 'ok');
      } catch (_err) {
        setRunnerHealthy(false);
      } finally {
        setLoading(false);
      }
    }

    checkHealth();
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Shared Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-[var(--text-secondary)]" />
          <h1 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Deploy &amp; Monitor
          </h1>
        </div>
        <div>
          {loading ? (
            <Badge
              variant="outline"
              className="border-gray-500/30 bg-gray-500/10 text-[var(--color-text-secondary)]"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting...
            </Badge>
          ) : runnerHealthy ? (
            <Badge
              variant="outline"
              className="border-green-500/30 bg-green-500/10 text-[var(--status-success)]"
            >
              <CheckCircle className="h-3 w-3" />
              Runner Connected
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-red-500/30 bg-red-500/10 text-[var(--status-error)]"
            >
              <AlertCircle className="h-3 w-3" />
              Runner Offline
            </Badge>
          )}
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
