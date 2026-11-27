import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './app/AppShell';
import { ComingSoonPage, HomePage, NotFoundPage, RouteErrorPage } from './app/pages';
import { NAV_ITEMS } from './app/nav';
import { AuthPage } from './features/auth/AuthPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { restoreSession } from './features/auth/session';
import { ActivityPage } from './features/activity/ActivityPage';
import { AcceptInvitePage } from './features/team/AcceptInvitePage';
import { TeamPage } from './features/team/TeamPage';
import { ProjectLayout, ProjectOverview } from './features/projects/ProjectPage';
import { ProjectSectionRedirect } from './features/projects/ProjectSectionRedirect';
import { BoardPage } from './features/board/BoardPage';
import { SprintsPage } from './features/sprints/SprintsPage';
import { TasksPage } from './features/tasks/TasksPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { queryClient } from './lib/query';
import './styles/global.css';

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/login', element: <AuthPage mode="login" /> },
      { path: '/register', element: <AuthPage mode="register" /> },
      { path: '/invite/:token', element: <AcceptInvitePage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomePage /> },
              { path: '/projects', element: <ProjectsPage /> },
              {
                path: '/projects/:key',
                element: <ProjectLayout />,
                children: [
                  { index: true, element: <ProjectOverview /> },
                  { path: 'board', element: <BoardPage /> },
                  { path: 'sprints', element: <SprintsPage /> },
                  { path: 'tasks', element: <TasksPage /> },
                ],
              },
              { path: '/board', element: <ProjectSectionRedirect section="board" /> },
              { path: '/sprints', element: <ProjectSectionRedirect section="sprints" /> },
              { path: '/tasks', element: <ProjectSectionRedirect section="tasks" /> },
              { path: '/team', element: <TeamPage /> },
              { path: '/activity', element: <ActivityPage /> },
              ...NAV_ITEMS.filter((n) => n.path !== '/' && !n.built).map((n) => ({ path: n.path, element: <ComingSoonPage path={n.path} /> })),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

// Start the silent sign-in before React renders, so it overlaps with loading the page.
void restoreSession();

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
