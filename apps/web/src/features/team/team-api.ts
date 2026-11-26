import {
  authResponse,
  invitePreview,
  inviteResponse,
  invitesResponse,
  membersResponse,
  publicUser,
  roleWithPermissions,
  rolesResponse,
  type AcceptInviteInput,
  type CreateInviteInput,
  type PermissionKey,
  type RoleId,
} from '@taskflow/core';
import { z } from 'zod';
import { api } from '../../lib/http';

/** TanStack Query keys for this feature. */
export const teamKeys = {
  roles: ['roles'] as const,
  members: ['members'] as const,
  invites: ['invites'] as const,
  invite: (token: string) => ['invite', token] as const,
};

export const fetchRoles = (signal?: AbortSignal) => api('/api/roles', { schema: rolesResponse, ...(signal ? { signal } : {}) });
export const fetchMembers = (signal?: AbortSignal) => api('/api/members', { schema: membersResponse, ...(signal ? { signal } : {}) });
export const fetchInvites = (signal?: AbortSignal) => api('/api/invites', { schema: invitesResponse, ...(signal ? { signal } : {}) });

export const setPermission = (roleId: RoleId, key: PermissionKey, granted: boolean) =>
  api(`/api/roles/${roleId}/permissions/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { granted },
    schema: z.object({ role: roleWithPermissions }),
  });

export const changeMemberRole = (userId: string, roleId: RoleId) =>
  api(`/api/members/${userId}/role`, { method: 'PATCH', body: { roleId }, schema: z.object({ member: publicUser }) });

export const createInvite = (input: CreateInviteInput) =>
  api('/api/invites', { method: 'POST', body: input, schema: inviteResponse });

export const resendInvite = (id: string) => api(`/api/invites/${id}/resend`, { method: 'POST', schema: inviteResponse });

export const cancelInvite = (id: string) => api(`/api/invites/${id}`, { method: 'DELETE', schema: z.null() });

export const fetchInvitePreview = (token: string, signal?: AbortSignal) =>
  api(`/api/auth/invites/${encodeURIComponent(token)}`, { schema: invitePreview, ...(signal ? { signal } : {}) });

export const acceptInvite = (token: string, input: AcceptInviteInput) =>
  api(`/api/auth/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', body: input, schema: authResponse });
