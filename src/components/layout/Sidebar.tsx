import { NavLink } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { navigationItems } from '../../config/navigation';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <div
        className={`sidebar-overlay${isOpen ? ' is-visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar${isOpen ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand">
          <span className="sidebar-logo">
            <Wallet size={20} />
          </span>
          <span className="sidebar-brand-name">Smart Cash Flow</span>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-avatar">AM</div>
          <div className="sidebar-user">
            <span className="sidebar-user-name">Alex Morgan</span>
            <span className="sidebar-user-role">Freelance Web Designer</span>
          </div>
        </div>
      </aside>
    </>
  );
}

