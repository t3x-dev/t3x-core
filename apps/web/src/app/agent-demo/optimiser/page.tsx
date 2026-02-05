'use client';

import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  GitCommit,
  Loader2,
  MessageSquare,
  Rocket,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  type DeploymentRecord,
  type SandboxCommit,
  useAgentDemoStore,
} from '@/store/agentDemoStore';

// Commit detail modal
function CommitDetailModal({
  commit,
  onClose,
  onDeploy,
  isDeployed,
}: {
  commit: SandboxCommit;
  onClose: () => void;
  onDeploy: () => void;
  isDeployed: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(commit.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
          <div>
            <CardTitle className="text-lg">v{commit.version}-sandbox</CardTitle>
            <code className="text-xs text-muted-foreground">commit {commit.commitHash}</code>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 overflow-auto">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{commit.createdAt}</span>
            {commit.feedbackBatchId > 0 && (
              <Badge variant="secondary">Feedback batch #{commit.feedbackBatchId}</Badge>
            )}
          </div>

          <p className="text-sm leading-relaxed">{commit.description}</p>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium">Prompt Content</h4>
              <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 gap-1.5">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
              {commit.content}
            </pre>
          </div>

          <div className="flex justify-end border-t pt-4">
            {isDeployed ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-green-500/30 bg-green-500/10 text-green-600"
              >
                <Check className="h-3.5 w-3.5" />
                Currently Deployed
              </Badge>
            ) : (
              <Button onClick={onDeploy} className="gap-2">
                <Rocket className="h-4 w-4" />
                Deploy commit to Chat Demo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Status badge colors for deployments
const deploymentStatusColors = {
  succeeded: 'border-green-500/30 bg-green-500/10 text-green-600',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
} as const;

export default function AgentDemoOptimiserPage() {
  const router = useRouter();
  const [selectedCommit, setSelectedCommit] = useState<SandboxCommit | null>(null);

  const {
    agentName,
    sandboxBranch,
    deployedVersion,
    deployedCommitHash,
    sandboxHeadVersion,
    sandboxHeadCommitHash,
    sandboxCommits,
    deploymentHistory,
    feedbackSummary,
    isOptimizing,
    runOptimisation,
    deployCommit,
  } = useAgentDemoStore();

  const handleDeploy = async (commitHash: string) => {
    await deployCommit(commitHash);
    setSelectedCommit(null);
  };

  const sortedCommits = [...sandboxCommits].reverse();

  const optimisationSteps = [
    { id: 1, label: 'Collect feedback', icon: MessageSquare },
    { id: 2, label: 'Propose new prompt', icon: Sparkles },
    { id: 3, label: 'Auto commit on sandbox', icon: GitCommit },
    { id: 4, label: 'Review and deploy', icon: Rocket },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-5 border-b bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{agentName}</h2>
        </div>
        <div className="flex items-center gap-5 border-l pl-5 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <GitCommit className="h-3.5 w-3.5" />
            Branch: {sandboxBranch}
          </span>
          <span>
            Head: v{sandboxHeadVersion}-sandbox ({sandboxHeadCommitHash})
          </span>
          <span className="flex items-center gap-2 font-medium text-green-600">
            <Rocket className="h-3.5 w-3.5" />
            Deployed: v{deployedVersion} ({deployedCommitHash})
          </span>
        </div>
        <Button className="ml-auto gap-2" onClick={() => router.push('/agent-demo/chat')}>
          <MessageSquare className="h-4 w-4" />
          Open Chat
        </Button>
      </header>

      {/* Main Content - Three Columns */}
      <div className="grid flex-1 grid-cols-3 gap-px overflow-hidden bg-border">
        {/* Left: Feedback + Optimisation */}
        <section className="flex flex-col overflow-hidden bg-background">
          <Card className="m-4 mb-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Feedback Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <span className="block text-2xl font-semibold">
                    {feedbackSummary.conversationCount}
                  </span>
                  <span className="text-xs text-muted-foreground">Conversations</span>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <span className="flex items-center justify-center gap-1 text-2xl font-semibold">
                    {feedbackSummary.totalRatings > 0 ? (
                      <>
                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        {feedbackSummary.averageRating.toFixed(1)}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">Avg Rating</span>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <span className="block text-2xl font-semibold text-destructive">
                    {feedbackSummary.lowRatingCount}
                  </span>
                  <span className="text-xs text-muted-foreground">Low (1-2★)</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Feedback from Chat page is used for prompt optimisation.
              </p>
            </CardContent>
          </Card>

          <Card className="mx-4 mt-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Optimisation Loop</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {optimisationSteps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs">
                      <step.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{step.label}</span>
                    </div>
                    {index < optimisationSteps.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => runOptimisation()}
                disabled={isOptimizing || feedbackSummary.totalRatings < 1}
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Run Optimisation
                  </>
                )}
              </Button>
              {feedbackSummary.totalRatings < 1 && !isOptimizing && (
                <p className="text-center text-xs text-muted-foreground">
                  Rate at least one response in Chat to enable
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Center: Sandbox Commits */}
        <section className="flex flex-col overflow-hidden bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-medium">Sandbox Commits</h3>
            <Badge variant="secondary">{sandboxCommits.length} commits</Badge>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {sortedCommits.map((commit) => {
              const isDeployed = commit.commitHash === deployedCommitHash;
              return (
                <button
                  type="button"
                  key={commit.id}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                    isDeployed && 'border-green-500/30 bg-green-500/5'
                  )}
                  onClick={() => setSelectedCommit(commit)}
                >
                  <div className="flex items-start gap-3">
                    <GitCommit
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        isDeployed ? 'text-green-600' : 'text-muted-foreground'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">v{commit.version}-sandbox</span>
                        <code className="text-xs text-muted-foreground">{commit.commitHash}</code>
                        {isDeployed && (
                          <Badge
                            variant="outline"
                            className="border-green-500/30 bg-green-500/10 text-green-600 text-[10px]"
                          >
                            deployed
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                        {commit.description}
                      </p>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {commit.createdAt}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: Deployment History */}
        <section className="flex flex-col overflow-hidden bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-medium">Deployments</h3>
            <Badge variant="secondary">{deploymentHistory.length} records</Badge>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {deploymentHistory.map((deployment: DeploymentRecord) => (
              <div key={deployment.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{deployment.version}</span>
                  <code className="text-xs text-muted-foreground">{deployment.commitHash}</code>
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-auto text-[10px]',
                      deploymentStatusColors[
                        deployment.status as keyof typeof deploymentStatusColors
                      ]
                    )}
                  >
                    {deployment.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{deployment.timestamp}</span>
                  <span>→ {deployment.environment}</span>
                </div>
                <Badge variant="secondary" className="mt-2 text-[10px]">
                  {deployment.triggerSource}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Commit Detail Modal */}
      {selectedCommit !== null && (
        <CommitDetailModal
          key={selectedCommit.id}
          commit={selectedCommit}
          onClose={() => setSelectedCommit(null)}
          onDeploy={() => handleDeploy(selectedCommit.commitHash)}
          isDeployed={selectedCommit.commitHash === deployedCommitHash}
        />
      )}
    </div>
  );
}
