import { NavLink } from 'react-router-dom';
import { Calendar, RotateCcw, Target, BarChart3, Settings, Sparkles } from 'lucide-react';

const navItems = [
  { to: '/daily', label: 'Daily', icon: RotateCcw },
  { to: '/weekly', label: 'Weekly', icon: Calendar },
  { to: '/monthly', label: 'Monthly', icon: BarChart3 },
  { to: '/goals', label: 'Goals & Habits', icon: Target },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Sparkles size={18} style={{ display: 'inline', marginRight: 6, color: 'var(--blue)' }} />
          Momentum
        </div>
        <div className="sidebar-subtitle">Personal Planner</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <item.icon className="sidebar-link-icon" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
          v0.1.0
        </div>
      </div>
    </aside>
  );
}
