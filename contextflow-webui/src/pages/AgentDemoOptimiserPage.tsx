import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  Star,
  GitCommit,
  Rocket,
  MessageSquare,
  Sparkles,
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

  const sortedCommits = [...sandboxCommits].reverse()

  const optimisationSteps = [
    { id: 1, label: 'Collect feedback', icon: MessageSquare },
    { id: 2, label: 'Propose new prompt', icon: Sparkles },
    { id: 3, label: 'Auto commit on sandbox', icon: GitCommit },
    { id: 4, label: 'Review and deploy', icon: Rocket },
  ]

  return (
    <div className="agent-optimiser-page">
      {/* Header */}
      <header className="agent-optimiser-page__header">
        <div className="agent-optimiser-page__header-left">
          <Bot size={20} />
          <h2>{agentName}</h2>
        </div>
        <div className="agent-optimiser-page__header-meta">
          <span className="agent-optimiser-page__meta-item">
            <GitCommit size={14} />
            Branch: {sandboxBranch}
          </span>
          <span className="agent-optimiser-page__meta-item">
            Head: v{sandboxHeadVersion}-sandbox ({sandboxHeadCommitHash})
          </span>
          <span className="agent-optimiser-page__meta-item agent-optimiser-page__meta-item--deployed">
            <Rocket size={14} />
            Deployed: v{deployedVersion} ({deployedCommitHash})
          </span>
        </div>
        <button
          className="agent-optimiser-page__chat-btn"
          onClick={() => navigate('/agent-demo/chat')}
        >
          <MessageSquare size={16} />
          Open Chat
        </button>
      </header>

      {/* Main Content - Three Columns */}
      <div className="agent-optimiser-page__body">
        {/* Left: Feedback + Optimisation */}
        <section className="agent-optimiser-page__section">
          <div className="agent-optimiser-page__section-header">
            <h3>Feedback Summary</h3>
          </div>
          <div className="agent-optimiser-page__section-content">
            <div className="feedback-stats">
              <div className="feedback-stats__item">
                <span className="feedback-stats__value">{feedbackSummary.conversationCount}</span>
                <span className="feedback-stats__label">Conversations</span>
              </div>
              <div className="feedback-stats__item">
                <span className="feedback-stats__value">
                  {feedbackSummary.totalRatings > 0 ? (
                    <>
                      <Star size={14} fill="currentColor" />
                      {feedbackSummary.averageRating.toFixed(1)}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="feedback-stats__label">Avg Rating</span>
              </div>
              <div className="feedback-stats__item">
                <span className="feedback-stats__value feedback-stats__value--low">
                  {feedbackSummary.lowRatingCount}
                </span>
                <span className="feedback-stats__label">Low (1-2★)</span>
              </div>
            </div>
            <p className="feedback-stats__hint">
              Feedback from Chat page is used for prompt optimisation.
            </p>
          </div>

          <div className="agent-optimiser-page__section-header">
            <h3>Optimisation Loop</h3>
          </div>
          <div className="agent-optimiser-page__section-content">
            <div className="optimisation-steps">
              {optimisationSteps.map((step, index) => (
                <div key={step.id} className="optimisation-steps__item">
                  <div className="optimisation-steps__icon">
                    <step.icon size={14} />
                  </div>
                  <span>{step.label}</span>
                  {index < optimisationSteps.length - 1 && (
                    <ArrowRight size={12} className="optimisation-steps__arrow" />
                  )}
                </div>
              ))}
            </div>
            <button
              className="optimisation-run-btn"
              onClick={() => runOptimisation()}
              disabled={isOptimizing || feedbackSummary.totalRatings < 1}
            >
              {isOptimizing ? (
                <>
                  <RefreshCw size={16} className="spinning" />
                  Running...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Run Optimisation
                </>
              )}
            </button>
            {feedbackSummary.totalRatings < 1 && !isOptimizing && (
              <p className="optimisation-hint">
                Rate at least one response in Chat to enable
              </p>
            )}
          </div>
        </section>

        {/* Center: Sandbox Commits */}
        <section className="agent-optimiser-page__section">
          <div className="agent-optimiser-page__section-header">
            <h3>Sandbox Commits</h3>
            <span className="agent-optimiser-page__section-subtitle">
              {sandboxCommits.length} commits
            </span>
          </div>
          <div className="agent-optimiser-page__section-content agent-optimiser-page__section-content--scroll">
            {sortedCommits.map((commit) => {
              const isDeployed = commit.commitHash === deployedCommitHash
              return (
                <button
                  key={commit.id}
                  className={`commit-row ${isDeployed ? 'commit-row--deployed' : ''}`}
                  onClick={() => setSelectedCommit(commit)}
                >
                  <GitCommit size={14} className="commit-row__icon" />
                  <div className="commit-row__info">
                    <div className="commit-row__header">
                      <span className="commit-row__version">v{commit.version}-sandbox</span>
                      <code className="commit-row__hash">{commit.commitHash}</code>
                      {isDeployed && <span className="commit-row__badge">deployed</span>}
                    </div>
                    <p className="commit-row__desc">{commit.description}</p>
                    <span className="commit-row__time">{commit.createdAt}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Right: Deployment History */}
        <section className="agent-optimiser-page__section">
          <div className="agent-optimiser-page__section-header">
            <h3>Deployments</h3>
            <span className="agent-optimiser-page__section-subtitle">
              {deploymentHistory.length} records
            </span>
          </div>
          <div className="agent-optimiser-page__section-content agent-optimiser-page__section-content--scroll">
            {deploymentHistory.map((deployment: DeploymentRecord) => (
              <div key={deployment.id} className="deployment-row">
                <div className="deployment-row__header">
                  <span className="deployment-row__version">v{deployment.version}</span>
                  <code className="deployment-row__hash">{deployment.commitHash}</code>
                  <span className={`deployment-row__status deployment-row__status--${deployment.status}`}>
                    {deployment.status}
                  </span>
                </div>
                <div className="deployment-row__meta">
                  <span>{deployment.timestamp}</span>
                  <span>→ {deployment.environment}</span>
                </div>
                <span className="deployment-row__trigger">{deployment.triggerSource}</span>
              </div>
            ))}
          </div>
        </section>
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
