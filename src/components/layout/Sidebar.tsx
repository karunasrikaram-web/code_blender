import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { navigationItems } from '../../config/navigation';
import { getProfile } from '../../services/settingsApi';
import type { ProfileSettings } from '../../services/settingsApi';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getProfile()
      .then((profile) => {
        if (!active) return;
        setProfileName(resolveDisplayName(profile));
      })
      .catch(() => {
        // Keep the sidebar quiet if the profile cannot be loaded.
      });
    return () => {
      active = false;
    };
  }, []);

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
          <div className="sidebar-avatar">{profileName ? getInitials(profileName) : ''}</div>
          <div className="sidebar-user">
            {profileName !== null && <span className="sidebar-user-name">{profileName}</span>}
            <span className="sidebar-user-role">Freelance Web Designer</span>
          </div>
        </div>
      </aside>
    </>
  );
}

