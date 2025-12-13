import { NavLink, useLocation } from 'react-router-dom'
import { Home, BarChart3, FileText, Github, Rocket } from 'lucide-react'

// T3X Logo - Two obtuse angles facing each other (bowtie shape)
function LogoIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGradientLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="logoGradientRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      {/* Left angle > pointing right */}
      <path
        d="M4 6L14 16L4 26"
        stroke="url(#logoGradientLeft)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Right angle < pointing left */}
      <path
        d="M28 6L18 16L28 26"
        stroke="url(#logoGradientRight)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

// Robot/Agent icon
function AgentIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Robot head */}
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Antenna */}
      <path
        d="M12 6V3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="2" r="1.5" fill="currentColor" />
      {/* Left eye */}
      <circle cx="9" cy="11" r="1.5" fill="currentColor" />
      {/* Right eye */}
      <circle cx="15" cy="11" r="1.5" fill="currentColor" />
      {/* Mouth */}
      <path
        d="M9 15h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Ears */}
      <path
        d="M4 10H2M22 10h-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Sidebar() {
  const location = useLocation()
  const isAgentDemo = location.pathname.startsWith('/agent-demo')
  const isDeploy = location.pathname.startsWith('/deploy') || location.pathname.startsWith('/eval')
  const isInsights = location.pathname.startsWith('/insights')
  const isHome = location.pathname === '/' || location.pathname.startsWith('/project')

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar__logo">
        <LogoIcon />
      </div>

      {/* Main Navigation */}
      <nav className="sidebar__nav">
        <NavLink
          to="/"
          className={() =>
            `sidebar__nav-item ${isHome ? 'sidebar__nav-item--active' : ''}`
          }
          title="Projects"
        >
          <Home size={20} />
        </NavLink>

        <NavLink
          to="/agent-demo/chat"
          className={() =>
            `sidebar__nav-item ${isAgentDemo ? 'sidebar__nav-item--active' : ''}`
          }
          title="Agent Demo"
        >
          <AgentIcon />
        </NavLink>

        <NavLink
          to="/deploy"
          className={() =>
            `sidebar__nav-item ${isDeploy ? 'sidebar__nav-item--active' : ''}`
          }
          title="Deploy & Eval"
        >
          <Rocket size={20} />
        </NavLink>
      </nav>

      {/* Bottom Navigation */}
      <nav className="sidebar__nav sidebar__nav--bottom">
        <NavLink
          to="/insights"
          className={() =>
            `sidebar__nav-item ${isInsights ? 'sidebar__nav-item--active' : ''}`
          }
          title="Insights"
        >
          <BarChart3 size={20} />
        </NavLink>

        <button
          className="sidebar__nav-item"
          title="Docs (Coming Soon)"
          disabled
        >
          <FileText size={20} />
        </button>

        <a
          href="https://github.com/anthropics/t3x"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar__nav-item"
          title="GitHub"
        >
          <Github size={20} />
        </a>
      </nav>
    </aside>
  )
}
