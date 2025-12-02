import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  Star,
  GitCommit,
  Rocket,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import { useAgentDemoStore, type SandboxCommit, type DeploymentRecord } from '../store/agentDemoStore'

// Commit detail modal
function CommitDetailModal({
  commit,
  onClose,
  onDeploy,
  isDeployed,
}: {
  commit: SandboxCommit
  onClose: () => void
  onDeploy: () => void
  isDeployed: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(commit.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="commit-modal-overlay" onClick={onClose}>
      <div className="commit-modal" onClick={(e) => e.stopPropagation()}>
        <header className="commit-modal__header">
          <div>
            <h3>v{commit.version}-sandbox</h3>
            <span className="commit-modal__hash">commit {commit.commitHash}</span>
          </div>
          <button className="commit-modal__close" onClick={onClose}>×</button>
        </header>

        <div className="commit-modal__meta">
          <span>{commit.createdAt}</span>
          {commit.feedbackBatchId > 0 && (
            <span className="commit-modal__batch">Feedback batch #{commit.feedbackBatchId}</span>
          )}
        </div>

        <p className="commit-modal__description">{commit.description}</p>

        <div className="commit-modal__prompt">
          <div className="commit-modal__prompt-header">
            <h4>Prompt Content</h4>
            <button onClick={handleCopy} className="commit-modal__copy-btn">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre>{commit.content}</pre>
        </div>

        <footer className="commit-modal__footer">
          {isDeployed ? (
            <span className="commit-modal__deployed-badge">
              <Check size={14} /> Currently Deployed
            </span>
          ) : (
            <button className="commit-modal__deploy-btn" onClick={onDeploy}>
              <Rocket size={16} />
              Deploy commit to Chat Demo
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

// Optimisation loop visualisation
function OptimisationLoop({
  onRunOptimisation,
  isOptimizing,
  canOptimize,
}: {
  onRunOptimisation: () => void
  isOptimizing: boolean
  canOptimize: boolean
}) {
  const steps = [
    { id: 1, label: 'Collect feedback', icon: MessageSquare },
    { id: 2, label: 'Propose new prompt', icon: Sparkles },
    { id: 3, label: 'Auto commit on sandbox', icon: GitCommit },
    { id: 4, label: 'Review and deploy', icon: Rocket },
  ]

  return (
    <div className="optimisation-loop">
      <h4>Optimisation Loop</h4>
      <div className="optimisation-loop__steps">
        {steps.map((step, index) => (
          <div key={step.id} className="optimisation-loop__step">
            <div className="optimisation-loop__step-icon">
              <step.icon size={16} />
            </div>
            <span>{step.label}</span>
            {index < steps.length - 1 && (
              <ArrowRight size={14} className="optimisation-loop__arrow" />
            )}
          </div>
        ))}
      </div>
      <button
        className="optimisation-loop__run-btn"
        onClick={onRunOptimisation}
        disabled={isOptimizing || !canOptimize}
      >
        {isOptimizing ? (
          <>
            <RefreshCw size={16} className="spinning" />
            Running Optimisation...
          </>
        ) : (
          <>
            <Sparkles size={16} />
            Run Optimisation
          </>
        )}
      </button>
      {!canOptimize && !isOptimizing && (
        <p className="optimisation-loop__hint">
          Rate at least one response in Chat to enable optimisation
        </p>
      )}
    </div>
  )
}

// Sandbox commit history
function SandboxHistory({
  commits,
  deployedCommitHash,
  onSelectCommit,
}: {
  commits: SandboxCommit[]
  deployedCommitHash: string
  onSelectCommit: (commit: SandboxCommit) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const sortedCommits = [...commits].reverse()

  return (
    <div className="sandbox-history">
      <header className="sandbox-history__header" onClick={() => setExpanded(!expanded)}>
        <div>
          <h4>Sandbox Prompt History</h4>
          <span className="sandbox-history__branch">Branch: agent-support/prompt-sandbox</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </header>

      {expanded && (
        <div className="sandbox-history__list">
          {sortedCommits.map((commit) => {
            const isDeployed = commit.commitHash === deployedCommitHash
            return (
              <button
                key={commit.id}
                className={`sandbox-history__item ${isDeployed ? 'sandbox-history__item--deployed' : ''}`}
                onClick={() => onSelectCommit(commit)}
              >
                <div className="sandbox-history__item-icon">
                  <GitCommit size={14} />
                </div>
                <div className="sandbox-history__item-info">
                  <div className="sandbox-history__item-header">
                    <span className="sandbox-history__item-version">v{commit.version}-sandbox</span>
                    <code className="sandbox-history__item-hash">{commit.commitHash}</code>
                    {isDeployed && (
                      <span className="sandbox-history__item-badge">deployed</span>
                    )}
                  </div>
                  <p className="sandbox-history__item-desc">{commit.description}</p>
                  <span className="sandbox-history__item-time">{commit.createdAt}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Deployment history
function DeploymentHistory({ deployments }: { deployments: DeploymentRecord[] }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="deployment-history">
      <header className="deployment-history__header" onClick={() => setExpanded(!expanded)}>
        <div>
          <h4>Deployment History</h4>
          <span className="deployment-history__count">{deployments.length} deployments</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </header>

      <p className="deployment-history__info">
        Each deployment updates the Chat page to use the prompt from a specific sandbox commit.
      </p>

      {expanded && (
        <div className="deployment-history__list">
          {deployments.map((deployment) => (
            <div key={deployment.id} className="deployment-history__item">
              <div className="deployment-history__item-header">
                <span className="deployment-history__item-version">v{deployment.version}</span>
                <code className="deployment-history__item-hash">{deployment.commitHash}</code>
                <span className={`deployment-history__item-status deployment-history__item-status--${deployment.status}`}>
                  {deployment.status}
                </span>
              </div>
              <div className="deployment-history__item-meta">
                <span>{deployment.timestamp}</span>
                <span>→ {deployment.environment}</span>
              </div>
              <span className="deployment-history__item-trigger">{deployment.triggerSource}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgentDemoOptimiserPage() {
  const navigate = useNavigate()
  const [selectedCommit, setSelectedCommit] = useState<SandboxCommit | null>(null)

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
  } = useAgentDemoStore()

  const handleDeploy = async (commitHash: string) => {
    await deployCommit(commitHash)
    setSelectedCommit(null)
  }

  return (
    <div className="agent-demo-optimiser-page">
      {/* Top Summary Bar */}
      <header className="agent-demo-optimiser-page__summary">
        <div className="agent-demo-optimiser-page__summary-item">
          <Bot size={20} />
          <div>
            <span className="agent-demo-optimiser-page__summary-label">Agent</span>
            <strong>{agentName}</strong>
          </div>
        </div>
        <div className="agent-demo-optimiser-page__summary-item">
          <GitCommit size={18} />
          <div>
            <span className="agent-demo-optimiser-page__summary-label">Sandbox branch</span>
            <strong>{sandboxBranch}</strong>
          </div>
        </div>
        <div className="agent-demo-optimiser-page__summary-item">
          <div>
            <span className="agent-demo-optimiser-page__summary-label">Sandbox head</span>
            <strong>v{sandboxHeadVersion}-sandbox ({sandboxHeadCommitHash})</strong>
          </div>
        </div>
        <div className="agent-demo-optimiser-page__summary-item agent-demo-optimiser-page__summary-item--highlight">
          <Rocket size={18} />
          <div>
            <span className="agent-demo-optimiser-page__summary-label">Deployed</span>
            <strong>v{deployedVersion} ({deployedCommitHash})</strong>
          </div>
        </div>
        <button
          className="agent-demo-optimiser-page__chat-btn"
          onClick={() => navigate('/agent-demo/chat')}
        >
          <MessageSquare size={16} />
          Open Chat
        </button>
      </header>

      {/* Main Content */}
      <div className="agent-demo-optimiser-page__content">
        {/* Left Column: Feedback & Optimisation */}
        <div className="agent-demo-optimiser-page__left">
          {/* Feedback Summary */}
          <div className="feedback-summary">
            <h4>Recent Feedback</h4>
            <div className="feedback-summary__stats">
              <div className="feedback-summary__stat">
                <span className="feedback-summary__stat-value">
                  {feedbackSummary.conversationCount}
                </span>
                <span className="feedback-summary__stat-label">Conversations</span>
              </div>
              <div className="feedback-summary__stat">
                <span className="feedback-summary__stat-value">
                  {feedbackSummary.totalRatings > 0 ? (
                    <>
                      <Star size={14} fill="currentColor" />
                      {feedbackSummary.averageRating.toFixed(1)}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="feedback-summary__stat-label">Avg Rating</span>
              </div>
              <div className="feedback-summary__stat">
                <span className="feedback-summary__stat-value feedback-summary__stat-value--low">
                  {feedbackSummary.lowRatingCount}
                </span>
                <span className="feedback-summary__stat-label">Low ratings (1-2★)</span>
              </div>
            </div>
            <p className="feedback-summary__info">
              Feedback shown here comes from the Chat page. It is used as input for prompt
              optimisation on the sandbox branch.
            </p>
          </div>

          {/* Optimisation Loop */}
          <OptimisationLoop
            onRunOptimisation={() => runOptimisation()}
            isOptimizing={isOptimizing}
            canOptimize={feedbackSummary.totalRatings >= 1}
          />
        </div>

        {/* Centre Column: Sandbox Commit History */}
        <div className="agent-demo-optimiser-page__centre">
          <SandboxHistory
            commits={sandboxCommits}
            deployedCommitHash={deployedCommitHash}
            onSelectCommit={setSelectedCommit}
          />
        </div>

        {/* Right Column: Deployment History */}
        <div className="agent-demo-optimiser-page__right">
          <DeploymentHistory deployments={deploymentHistory} />
        </div>
      </div>

      {/* Commit Detail Modal */}
      {selectedCommit && (
        <CommitDetailModal
          commit={selectedCommit}
          onClose={() => setSelectedCommit(null)}
          onDeploy={() => handleDeploy(selectedCommit.commitHash)}
          isDeployed={selectedCommit.commitHash === deployedCommitHash}
        />
      )}
    </div>
  )
}
