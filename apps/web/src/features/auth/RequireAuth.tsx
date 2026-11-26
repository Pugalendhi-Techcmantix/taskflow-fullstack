import { Navigate, Outlet, useLocation } from 'react-router';
import { restoreSession, useSession } from './session';

/** Gate for every signed-in page. Remembers where the user wanted to go. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  switch (session.status) {
    case 'loading':
      return (
        <div className="center-screen" aria-busy="true">
          <div className="logo pulse" aria-hidden="true">TF</div>
          <span className="visually-hidden">Loading TaskFlow…</span>
        </div>
      );
    case 'unavailable':
      return (
        <div className="center-screen">
          <div className="card error-state" role="alert">
            <h1>Can&apos;t reach TaskFlow</h1>
            <p className="muted">{session.message}</p>
            <button className="btn primary" onClick={() => void restoreSession()}>Try again</button>
          </div>
        </div>
      );
    case 'anonymous':
      return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    case 'authenticated':
      return <Outlet />;
  }
}
