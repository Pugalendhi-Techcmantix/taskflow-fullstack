import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { REALTIME, realtimeAuth, type NotificationMessage, type ProjectChangedMessage } from '@taskflow/core';
import type { Repositories } from '../../repositories';
import type { Actor } from '../access/actor';
import { isAdmin } from '../access/actor';
import type { ActivityInput } from '../activity/activity.service';

/** Server → client messages, typed for Socket.IO. */
type ServerToClient = {
  [REALTIME.projectChanged]: (message: ProjectChangedMessage) => void;
  [REALTIME.notification]: (message: NotificationMessage) => void;
};
type SocketData = { userId: string };
type RealtimeServer = Server<Record<string, never>, ServerToClient, Record<string, never>, SocketData>;

const userRoom = (userId: string) => `user:${userId}`;
const projectRoom = (projectId: string) => `project:${projectId}`;
/** Every Admin's sockets: Admins see every project, including ones created after they connected. */
const ADMINS = 'admins';

/**
 * What the rest of the API uses to push messages. Works (as a no-op) before Socket.IO is attached,
 * so services and tests don't depend on a running socket server.
 */
export type RealtimeHub = {
  toUser: (userId: string, message: NotificationMessage) => void;
  toProject: (projectId: string, message: ProjectChangedMessage) => void;
  /** Keeps project rooms in step with membership while people are connected. */
  joinProject: (who: { userId: string } | 'admins', projectId: string) => void;
  leaveProject: (userId: string, projectId: string) => void;
  attach: (io: RealtimeServer) => void;
};

export function createRealtimeHub(): RealtimeHub {
  let io: RealtimeServer | null = null;
  return {
    toUser: (userId, message) => io?.to(userRoom(userId)).emit(REALTIME.notification, message),
    toProject: (projectId, message) => io?.to(projectRoom(projectId)).emit(REALTIME.projectChanged, message),
    joinProject: (who, projectId) => io?.in(who === 'admins' ? ADMINS : userRoom(who.userId)).socketsJoin(projectRoom(projectId)),
    leaveProject: (userId, projectId) => io?.in(userRoom(userId)).socketsLeave(projectRoom(projectId)),
    attach: (server) => {
      io = server;
    },
  };
}

/**
 * Starts Socket.IO on the API's HTTP server. The handshake must carry a valid access token
 * (`auth: { token }`); each socket joins its user room and the rooms of every project its user can see.
 */
export function attachRealtime(
  httpServer: HttpServer,
  deps: {
    hub: RealtimeHub;
    verifyAccessToken: (token: string) => string;
    actorOf: (userId: string) => Promise<Actor>;
    repos: Pick<Repositories, 'projects'>;
    corsOrigins: string[];
  },
): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, { serveClient: false, cors: { origin: deps.corsOrigins, credentials: true } });

  io.use((socket, next) => {
    const auth = realtimeAuth.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error('unauthorized'));
    try {
      socket.data.userId = deps.verifyAccessToken(auth.data.token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    try {
      const actor = await deps.actorOf(socket.data.userId);
      const admin = isAdmin(actor);
      const visible = await deps.repos.projects.listVisible(actor.user.id, admin);
      await socket.join([userRoom(actor.user.id), ...(admin ? [ADMINS] : []), ...visible.map((p) => projectRoom(p.id))]);
    } catch {
      socket.disconnect(true); // account gone since the token was issued
    }
  });

  deps.hub.attach(io);
  return io;
}

/**
 * Listener: tells everyone viewing a project that it changed (their screens refetch), and keeps
 * project rooms in step with membership.
 */
export function createLiveUpdates(deps: { hub: RealtimeHub; repos: Pick<Repositories, 'projects' | 'users'> }) {
  return async ({ actorId, projectId, event, refs }: ActivityInput) => {
    if (!projectId) return;
    if (event.action === 'project.created') {
      if (actorId) deps.hub.joinProject({ userId: actorId }, projectId);
      deps.hub.joinProject('admins', projectId);
    }
    if (event.action === 'project.member_added' && refs?.memberId) deps.hub.joinProject({ userId: refs.memberId }, projectId);

    const [project, actor] = await Promise.all([deps.repos.projects.findById(projectId), actorId ? deps.repos.users.findById(actorId) : null]);
    if (project) {
      deps.hub.toProject(projectId, { projectKey: project.key, actor: actor ? { id: actor.id, name: actor.name } : null, event });
    }
    // After telling the room, so the removed member's screen also learns they lost access.
    if (event.action === 'project.member_removed' && refs?.memberId) deps.hub.leaveProject(refs.memberId, projectId);
  };
}
