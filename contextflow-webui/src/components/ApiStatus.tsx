/**
 * API connection status indicator
 */

import { useHealth } from '../hooks/useApi'

export function ApiStatus() {
  const { data, loading, error } = useHealth()

  if (loading) {
    return (
      <div className="api-status api-status--loading">
        <span className="api-status__dot" />
        <span>Connecting to Core API...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="api-status api-status--error">
        <span className="api-status__dot" />
        <span>Core API offline</span>
        <small>Start with: uvicorn core_api.app:app --port 8000</small>
      </div>
    )
  }

  return (
    <div className="api-status api-status--connected">
      <span className="api-status__dot" />
      <span>Connected</span>
      {data && <small>v{data.version}</small>}
    </div>
  )
}

export function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="loading-spinner">
      <div className="loading-spinner__circle" />
      <span>{message}</span>
    </div>
  )
}

export function ErrorMessage({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="error-message">
      <strong>Error</strong>
      <p>{error.message}</p>
      {onRetry && (
        <button className="secondary-btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
