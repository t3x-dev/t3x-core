import { NavLink, useLocation } from 'react-router-dom'
import { ApiStatus } from './ApiStatus'

export function TopNav() {
  const location = useLocation()
  const isWorkflow = location.pathname.startsWith('/workflow')

  return (
    <header className="top-nav">
      <NavLink
        to="/"
        className={({ isActive }) =>
          isActive && !isWorkflow ? 'top-link top-link--active' : 'top-link'
        }
      >
        Overview
      </NavLink>
      <button className={isWorkflow ? 'top-link top-link--active' : 'top-link'} disabled={!isWorkflow}>
        Workflow
      </button>
      <div style={{ marginLeft: 'auto' }}>
        <ApiStatus />
      </div>
    </header>
  )
}
