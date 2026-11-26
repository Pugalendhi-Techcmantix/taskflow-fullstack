import { z } from 'zod';
import { roleSummary } from './access';

/** The 8 project colours from the prototype. */
export const PROJECT_COLORS = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#7c3aed', '#0d9488', '#ca8a04'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export const projectColorSchema = z.enum(PROJECT_COLORS, { error: 'Pick one of the colours' });

/** 2–5 capital letters, e.g. "TF". Typed in any case; stored uppercase. */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}$/, 'Use 2–5 letters (A–Z)');

const projectName = z.string().trim().min(3, 'Use at least 3 characters').max(60, 'Use at most 60 characters');
const projectDescription = z.string().trim().max(500, 'Use at most 500 characters');

export const createProjectInput = z.object({
  name: projectName,
  key: projectKeySchema,
  description: projectDescription.default(''),
  color: projectColorSchema,
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

/** The key can't be changed after creation (task IDs and links depend on it). */
export const updateProjectInput = z
  .object({ name: projectName, description: projectDescription, color: projectColorSchema })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;

export const addProjectMemberInput = z.object({ userId: z.uuid('Pick a member') });

export const projectMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSummary,
  addedAt: z.string(),
});
export type ProjectMember = z.infer<typeof projectMember>;

export const project = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
  color: projectColorSchema,
  members: z.array(projectMember),
  /** Is the signed-in user a member? (Admins can see projects they are not a member of.) */
  isMember: z.boolean(),
  /** The sprint currently running in this project, if any. */
  activeSprint: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** For the progress bar on project cards. */
  taskCounts: z.object({ total: z.number().int(), done: z.number().int() }),
  createdAt: z.string(),
});
export type Project = z.infer<typeof project>;

export const projectsResponse = z.object({ projects: z.array(project) });
export const projectResponse = z.object({ project });
export const keyAvailability = z.object({ key: z.string(), available: z.boolean() });

/** "Customer Portal" → "CP", "Marketing" → "MAR". Only a suggestion; the user can edit it. */
export function suggestProjectKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return '';
  const key = words.length > 1 ? words.map((w) => w[0]).join('') : first;
  return (key.length >= 2 ? key : first).slice(0, words.length > 1 ? 5 : 3);
}
