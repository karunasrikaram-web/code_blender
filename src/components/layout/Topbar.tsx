import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { getProfile } from '../../services/settingsApi';
import type { ProfileSettings } from '../../services/settingsApi';

interface TopbarProps {
  onMenuClick: () => void;
}

function resolveDisplayName(profile: ProfileSettings): string {
  const fullName = profile.full_name.trim();
  if (fullName !== '') return fullName;
  const emailPrefix = profile.email.trim().split('@')[0] ?? '';
  return emailPrefix !== '' ? emailPrefix : 'User';
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getProfile()
      .then((profile) => {
        if (!active) return;
        setProfileName(resolveDisplayName(profile));
      })
      .catch(() => {
        // Keep the topbar quiet if the profile cannot be loaded.
      });
    return () => {
      active = false;
    };
  }, []);

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
        <div className="topbar-avatar" title={profileName ?? undefined}>
          {profileName ? getInitials(profileName) : ''}
        </div>
        <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
          <LogOut size={18} />
          <span className="topbar-signout-label">Sign out</span>
        </button>
      </div>
    </header>
  );
}

