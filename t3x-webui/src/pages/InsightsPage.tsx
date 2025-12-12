import { useState } from 'react'
import { Clock3 } from 'lucide-react'
import { SemanticCard } from '../components/SemanticCard'
import { boardColumns, semanticFeed, timeline } from '../data/sampleLedger'

const insightsTabs = [
  { id: 'ledger', label: 'Ledger' },
  { id: 'latest', label: 'Latest Commits' },
] as const

type InsightsTab = (typeof insightsTabs)[number]['id']

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightsTab>('ledger')

  const renderSection = () => {
    switch (activeTab) {
      case 'ledger':
        return (
          <div className="page-section">
            <div className="section-header">
              <h2>Ledger</h2>
              <p>Semantic turns, drafts, and commits from the ledger.</p>
            </div>
            <div className="card-grid">
              {semanticFeed.map((entry) => (
                <SemanticCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )
      case 'latest':
        return (
          <div className="page-section">
            <div className="latest-grid">
              <div className="timeline">
                <header>
                  <h3>Latest Commits</h3>
                  <span>
                    <Clock3 size={14} /> Updated live
                  </span>
                </header>
                <ul>
                  {timeline.map((item) => (
                    <li key={item.id}>
                      <div className={['timeline-pill', `timeline-pill--${item.stage}`].join(' ')}>
                        {item.stage.toUpperCase()}
                      </div>
                      <div>
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </div>
                      <small>{item.time}</small>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="status-board">
                {Object.entries(boardColumns).map(([column, entries]) => (
                  <div key={column} className="status-column">
                    <header>
                      <h4>{column}</h4>
                      <span>{entries.length}</span>
                    </header>
                    <ul>
                      {entries.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.title}</strong>
                          <p>{entry.summary}</p>
                          <span className={`badge badge--${entry.stage}`}>{entry.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="insights-page">
      <header className="insights-page__header">
        <h1>Insights</h1>
      </header>
      <div className="overview-tabs">
        {insightsTabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'overview-tab overview-tab--active' : 'overview-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {renderSection()}
    </div>
  )
}
