import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import type { PublicUser } from '@taskflow/core';
import { signOut, useSession } from '../features/auth/session';
import { ProjectSwitcher } from '../features/projects/ProjectSwitcher';
import { NewTaskButton } from '../features/tasks/NewTaskButton';
import { Avatar } from './Avatar';
import { Icon } from './icons';
import { NAV_ITEMS } from './nav';
import { toggleTheme } from './theme';
import { Toaster } from './toast';

export { initials } from './Avatar';

/** Collapsed sidebar is a per-browser preference (desktop only). */
const COLLAPSE_KEY = 'tf-sidebar-collapsed';
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
function saveCollapsed(value: boolean) {
  try {
    if (value) localStorage.setItem(COLLAPSE_KEY, '1');
    else localStorage.removeItem(COLLAPSE_KEY);
  } catch {
    // storage blocked: the choice lasts until reload
  }
}

/** Signed-in layout: sidebar, top bar with the user menu, and the page below. */
export function AppShell() {
  const session = useSession();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  if (session.status !== 'authenticated') return null; // RequireAuth guarantees this; narrows the type
  const closeNav = () => setNavOpen(false);
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
    saveCollapsed(!collapsed);
  };

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Sidebar">
        <div className="brand"><div className="logo" aria-hidden="true">TF</div><span className="brand-name">TaskFlow</span></div>
        <ProjectSwitcher onNavigate={closeNav} />
        <nav aria-label="Main">
          {NAV_ITEMS.filter((n) => n.section === 'main').map((n) => <SideLink key={n.path} item={n} onNavigate={closeNav} />)}
          <div className="nav-sec">Workspace</div>
          {NAV_ITEMS.filter((n) => n.section === 'workspace').map((n) => <SideLink key={n.path} item={n} onNavigate={closeNav} />)}
        </nav>
        <button className="nav-item collapse-btn" onClick={toggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Icon name="chev" />
          <span className="nl">{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      </aside>
      {navOpen && <div className="scrim" onClick={closeNav} aria-hidden="true" />}

      <div className="main-wrap">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setNavOpen((o) => !o)} aria-label="Open menu" aria-expanded={navOpen}>
            <Icon name="menu" />
          </button>
          <div className="top-actions">
            <NewTaskButton />
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

/** Project sections with their own sidebar item (/projects/TF/sprints highlights "Sprints", not "Projects"). */
const PROJECT_SECTIONS = ['sprints', 'board', 'tasks'];
const sectionOf = (pathname: string) => /^\/projects\/[^/]+\/([^/]+)/.exec(pathname)?.[1];

function SideLink({ item, onNavigate }: { item: (typeof NAV_ITEMS)[number]; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const section = sectionOf(pathname);
  const inSection = section !== undefined && PROJECT_SECTIONS.includes(section);
  const custom =
    item.path === '/projects' ? pathname.startsWith('/projects') && !inSection
    : inSection && item.path === `/${section}` ? true
    : undefined;
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      title={item.label}
      className={({ isActive }) => `nav-item ${(custom ?? isActive) ? 'active' : ''}`}
      aria-current={custom === true ? 'page' : undefined}
      onClick={onNavigate}
    >
      <Icon name={item.icon} />
      <span className="nl">{item.label}</span>
    </NavLink>
  );
}

/** Native popover: Escape and click-outside close it with no extra JavaScript. */
function UserMenu({ user }: { user: PublicUser }) {
  return (
    <>
      <button className="avatar-btn" popoverTarget="user-menu" aria-label={`Account menu for ${user.name}`}>
        <Avatar id={user.id} name={user.name} />
      </button>
      <div id="user-menu" popover="auto" className="dropdown" aria-label="Account">
        <div className="dd-head">
          <Avatar id={user.id} name={user.name} size="lg" />
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
