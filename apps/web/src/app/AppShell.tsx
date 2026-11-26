import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import type { PublicUser } from '@taskflow/core';
import { signOut, useSession } from '../features/auth/session';
import { ProjectSwitcher } from '../features/projects/ProjectSwitcher';
import { Icon } from './icons';
import { NAV_ITEMS } from './nav';
import { toggleTheme } from './theme';
import { Toaster } from './toast';

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

/** Signed-in layout: sidebar, top bar with the user menu, and the page below. */
export function AppShell() {
  const session = useSession();
  const [navOpen, setNavOpen] = useState(false);
  if (session.status !== 'authenticated') return null; // RequireAuth guarantees this; narrows the type
  const closeNav = () => setNavOpen(false);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Sidebar">
        <div className="brand"><div className="logo" aria-hidden="true">TF</div>TaskFlow</div>
        <ProjectSwitcher onNavigate={closeNav} />
        <nav aria-label="Main">
          {NAV_ITEMS.filter((n) => n.section === 'main').map((n) => <SideLink key={n.path} item={n} onNavigate={closeNav} />)}
          <div className="nav-sec">Workspace</div>
          {NAV_ITEMS.filter((n) => n.section === 'workspace').map((n) => <SideLink key={n.path} item={n} onNavigate={closeNav} />)}
        </nav>
      </aside>
      {navOpen && <div className="scrim" onClick={closeNav} aria-hidden="true" />}

      <div className="main-wrap">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setNavOpen((o) => !o)} aria-label="Open menu" aria-expanded={navOpen}>
            <Icon name="menu" />
          </button>
          <div className="top-actions">
            <UserMenu user={session.user} />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function SideLink({ item, onNavigate }: { item: (typeof NAV_ITEMS)[number]; onNavigate: () => void }) {
  return (
    <NavLink to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onNavigate}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </NavLink>
  );
}

/** Native popover: Escape and click-outside close it with no extra JavaScript. */
function UserMenu({ user }: { user: PublicUser }) {
  return (
    <>
      <button className="avatar-btn" popoverTarget="user-menu" aria-label={`Account menu for ${user.name}`}>
        <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
      </button>
      <div id="user-menu" popover="auto" className="dropdown" aria-label="Account">
        <div className="dd-head">
          <span className="avatar lg" aria-hidden="true">{initials(user.name)}</span>
          <div>
            <b>{user.name}</b>
            <div className="muted small">{user.email}</div>
            <span className="pill" style={{ marginTop: 4, display: 'inline-block' }}>{user.role.name}</span>
          </div>
        </div>
        <button className="menu-item" onClick={toggleTheme}><Icon name="moon" size={16} /> Toggle dark mode</button>
        <button className="menu-item danger" onClick={() => void signOut()}><Icon name="logout" size={16} /> Sign out</button>
      </div>
    </>
  );
}
