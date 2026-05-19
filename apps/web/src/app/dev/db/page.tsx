'use client';

import { useCallback, useEffect, useState } from 'react';

interface TableInfo {
  name: string;
  rowCount: number;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields?: { name: string; dataTypeID: number }[];
  error?: string;
}

const EXAMPLE_QUERIES = [
  { label: 'All tables', sql: "SELECT tablename FROM pg_tables WHERE schemaname = 'public'" },
  { label: 'Recent projects', sql: 'SELECT * FROM projects ORDER BY created_at DESC LIMIT 10' },
  {
    label: 'Recent turns',
    sql: 'SELECT turn_hash, role, LEFT(content, 100) as preview, created_at FROM turns ORDER BY created_at DESC LIMIT 20',
  },
  {
    label: 'Commits',
    sql: 'SELECT hash, branch, message, created_at FROM commits ORDER BY created_at DESC LIMIT 10',
  },
  { label: 'Conversations', sql: 'SELECT * FROM conversations ORDER BY created_at DESC LIMIT 10' },
  {
    label: 'Drafts',
    sql: 'SELECT draft_id, bridge_id, status, LEFT(text, 50) as preview FROM agent_drafts ORDER BY created_at DESC LIMIT 10',
  },
];

export default function DevDatabasePage() {
  const [sql, setSql] = useState('SELECT * FROM projects LIMIT 10');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch table info on mount
  useEffect(() => {
    fetch('/api/dev/sql')
      .then((res) => res.json())
      .then((data) => {
        if (data.tables) setTables(data.tables);
        if (data.error) setError(data.error);
      })
      .catch((err) => setError(err.message));
  }, []);

  const executeQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [sql]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      executeQuery();
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Database Inspector</h1>
        <span style={styles.badge}>DEV ONLY</span>
      </header>

      <div style={styles.layout}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>Tables</h3>
          {tables.map((t) => (
            <button
              type="button"
              key={t.name}
              style={styles.tableButton}
              onClick={() => setSql(`SELECT * FROM ${t.name} LIMIT 20`)}
            >
              <span>{t.name}</span>
              <span style={styles.rowCount}>{t.rowCount}</span>
            </button>
          ))}

          <h3 style={{ ...styles.sidebarTitle, marginTop: 24 }}>Quick Queries</h3>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              type="button"
              key={q.label}
              style={styles.queryButton}
              onClick={() => setSql(q.sql)}
            >
              {q.label}
            </button>
          ))}
        </aside>

        {/* Main */}
        <main style={styles.main}>
          <div style={styles.editorContainer}>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              style={styles.editor}
              placeholder="Enter SQL query..."
              spellCheck={false}
            />
            <div style={styles.editorFooter}>
              <span style={styles.hint}>Cmd/Ctrl + Enter to execute</span>
              <button
                type="button"
                onClick={executeQuery}
                disabled={loading}
                style={styles.runButton}
              >
                {loading ? 'Running...' : 'Run Query'}
              </button>
            </div>
          </div>

          {error && (
            <div style={styles.error}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {result && (
            <div style={styles.resultContainer}>
              <div style={styles.resultHeader}>
                {result.rowCount} row{result.rowCount !== 1 ? 's' : ''} returned
              </div>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {result.fields?.map((f) => (
                        <th key={f.name} style={styles.th}>
                          {f.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={JSON.stringify(row)}>
                        {result.fields?.map((f) => (
                          <td key={f.name} style={styles.td}>
                            {formatValue(row[f.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return 'NULL';
  if (value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--surface-app)',
    color: 'var(--text-primary)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 24px',
    borderBottom: '1px solid var(--stroke-default)',
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    backgroundColor: 'var(--status-error)',
    color: '#fff',
    borderRadius: 4,
  },
  layout: {
    display: 'flex',
    height: 'calc(100vh - 60px)',
  },
  sidebar: {
    width: 220,
    padding: 16,
    borderRight: '1px solid var(--stroke-default)',
    overflowY: 'auto',
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  tableButton: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: '6px 10px',
    marginBottom: 4,
    backgroundColor: 'transparent',
    border: '1px solid var(--stroke-default)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left',
  },
  rowCount: {
    color: 'var(--text-tertiary)',
    fontSize: 12,
  },
  queryButton: {
    display: 'block',
    width: '100%',
    padding: '6px 10px',
    marginBottom: 4,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--status-info)',
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left',
  },
  main: {
    flex: 1,
    padding: 24,
    overflowY: 'auto',
  },
  editorContainer: {
    marginBottom: 16,
  },
  editor: {
    width: '100%',
    minHeight: 120,
    padding: 12,
    backgroundColor: 'var(--surface-card)',
    border: '1px solid var(--stroke-default)',
    borderRadius: '6px 6px 0 0',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    fontSize: 14,
    resize: 'vertical',
    outline: 'none',
  },
  editorFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: 'var(--surface-card)',
    border: '1px solid var(--stroke-default)',
    borderTop: 'none',
    borderRadius: '0 0 6px 6px',
  },
  hint: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },
  runButton: {
    padding: '6px 16px',
    backgroundColor: 'var(--status-success)',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  error: {
    padding: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(248, 81, 73, 0.1)',
    border: '1px solid var(--status-error)',
    borderRadius: 6,
    color: 'var(--status-error)',
  },
  resultContainer: {
    border: '1px solid var(--stroke-default)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  resultHeader: {
    padding: '8px 12px',
    backgroundColor: 'var(--surface-card)',
    borderBottom: '1px solid var(--stroke-default)',
    fontSize: 12,
    color: 'var(--text-tertiary)',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '8px 12px',
    backgroundColor: 'var(--surface-card)',
    borderBottom: '1px solid var(--stroke-default)',
    textAlign: 'left',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--stroke-divider)',
    maxWidth: 300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
