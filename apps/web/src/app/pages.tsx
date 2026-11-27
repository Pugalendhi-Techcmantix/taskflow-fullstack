import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Icon } from './icons';
import { NAV_ITEMS } from './nav';

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
