import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { useSession } from '../features/auth/session';
import { Icon } from './icons';
import { NAV_ITEMS } from './nav';

/** Home page until the real dashboard arrives (Module 10). */
export function HomePage() {
  const session = useSession();
  if (session.status !== 'authenticated') return null;
  const { user } = session;
  const firstName = user.name.split(' ')[0] ?? user.name;
  const joined = new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome, {firstName}</h1>
          <p className="sub">You&apos;re signed in to TaskFlow.</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card" aria-labelledby="acc-h">
          <h2 id="acc-h" className="card-title">Your account</h2>
          <dl className="details">
            <dt>Name</dt><dd>{user.name}</dd>
            <dt>Email</dt><dd>{user.email}</dd>
            <dt>Member since</dt><dd>{joined}</dd>
          </dl>
        </section>
        <section className="card" aria-labelledby="next-h">
          <h2 id="next-h" className="card-title">Coming next</h2>
          <ul className="soon-list">
            {[...NAV_ITEMS].sort((a, b) => a.module - b.module).map((n) => (
              <li key={n.path}><Icon name={n.icon} size={16} /><span>{n.label}</span><span className="pill">Module {n.module}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/** Placeholder for pages whose module is not built yet. */
export function ComingSoonPage({ path }: { path: string }) {
  const item = NAV_ITEMS.find((n) => n.path === path);
  if (!item) return <NotFoundPage />;
  return (
    <>
      <div className="page-head"><div><h1>{item.label}</h1></div></div>
      <div className="card empty-state">
        <div className="empty-icon"><Icon name={item.icon} size={22} /></div>
        <h2>Arrives in Module {item.module}</h2>
        <p className="muted">This page is part of the plan and is not built yet.</p>
        <Link className="btn" to="/">Back to home</Link>
      </div>
    </>
  );
}

export function NotFoundPage() {
  return (
    <div className="card empty-state">
      <h2>Page not found</h2>
      <p className="muted">The link may be wrong or the page may have moved.</p>
      <Link className="btn primary" to="/">Go to home</Link>
    </div>
  );
}

/** Shown if a page crashes, instead of a blank screen. */
export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Unknown error';
  return (
    <div className="center-screen">
      <div className="card error-state" role="alert">
        <h1>Something went wrong</h1>
        <p className="muted">{message}</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Reload the page</button>
      </div>
    </div>
  );
}
