import { GitBranch, GitCommit, MessageSquare, Sparkles } from 'lucide-react'
import type { SemanticEntry } from '../types/semantic'

const stageConfig = {
  commit: {
    label: 'Commit',
    Icon: GitCommit,
    pillClass: 'pill pill-commit',
  },
  draft: {
    label: 'Draft',
    Icon: GitBranch,
    pillClass: 'pill pill-draft',
  },
  turn: {
    label: 'Conversation',
    Icon: MessageSquare,
    pillClass: 'pill pill-turn',
  },
} as const

interface SemanticCardProps {
  entry: SemanticEntry
}

export function SemanticCard({ entry }: SemanticCardProps) {
  const config = stageConfig[entry.stage]
  const Icon = config.Icon

  return (
    <article className="semantic-card">
      <header className="semantic-card__header">
        <div>
          <div className="semantic-card__id">
            <span>{entry.id}</span>
            <span className={config.pillClass}>
              <Icon size={14} />
              {config.label}
            </span>
          </div>
          <h3>{entry.title}</h3>
        </div>
        <div className="semantic-card__meta">
          <span>{entry.updatedAt}</span>
          <span>{entry.bridgePrompt}</span>
        </div>
      </header>

      <p className="semantic-card__summary">{entry.summary}</p>

      <div className="semantic-card__facets">
        {entry.facets.map((facet) => (
          <span key={facet}>{facet}</span>
        ))}
      </div>

      <footer className="semantic-card__footer">
        <div className="semantic-card__tags">
          {entry.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="semantic-card__evidence">
          <Sparkles size={14} />
          <span>{entry.evidenceCount} evidence</span>
        </div>
      </footer>
    </article>
  )
}
