import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn-ghost btn-icon topbar-menu"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
      >
        <Menu size={20} />
      </button>

      <div className="topbar-search">
        <Search size={16} className="topbar-search-icon" />
        <input type="search" className="input topbar-search-input" placeholder="Search customers, invoices..." />
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        <div className="topbar-avatar" title="Alex Morgan">
          AM
        </div>
        <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
          <LogOut size={18} />
          <span className="topbar-signout-label">Sign out</span>
        </button>
      </div>
    </header>
  );
}

