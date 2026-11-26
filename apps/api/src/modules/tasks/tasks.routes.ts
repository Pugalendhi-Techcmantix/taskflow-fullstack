import { Router } from 'express';
import { createCommentInput, createSubtaskInput, createTaskInput, moveTaskInput, projectKeySchema, updateSubtaskInput, updateTaskInput } from '@taskflow/core';
import { z } from 'zod';
import { parse } from '../../http/errors';
import type { Guards } from '../access/actor';
import type { TasksService } from './tasks.service';

const keyParam = z.object({ key: projectKeySchema });
const taskParams = z.object({ key: projectKeySchema, number: z.coerce.number().int().positive('Invalid task number') });
const subtaskParams = taskParams.extend({ subtaskId: z.uuid('Invalid subtask id') });
const commentParams = taskParams.extend({ commentId: z.uuid('Invalid comment id') });

/** /api/projects/:key/tasks — reading follows project visibility; changes need task permissions. */
export function createTasksRouter(tasks: TasksService, { signedIn, requirePermission, actorOf }: Guards): Router {
  const router = Router({ mergeParams: true });
  router.use(signedIn);

  router.get('/', async (req, res) => {
    const { key } = parse(keyParam, req.params);
    res.json({ tasks: await tasks.list(await actorOf(req), key) });
  });

  router.post('/', requirePermission('task:create'), async (req, res) => {
    const { key } = parse(keyParam, req.params);
    const input = parse(createTaskInput, req.body);
    res.status(201).json({ task: await tasks.create(await actorOf(req), key, input) });
  });

  router.get('/:number', async (req, res) => {
    const { key, number } = parse(taskParams, req.params);
    res.json({ task: await tasks.get(await actorOf(req), key, number) });
  });

  router.patch('/:number', requirePermission('task:update'), async (req, res) => {
    const { key, number } = parse(taskParams, req.params);
    const input = parse(updateTaskInput, req.body);
    res.json({ task: await tasks.update(await actorOf(req), key, number, input) });
  });

  /** Board drag-and-drop and keyboard moves. */
  router.post('/:number/move', requirePermission('task:move'), async (req, res) => {
    const { key, number } = parse(taskParams, req.params);
    const input = parse(moveTaskInput, req.body);
    res.json({ task: await tasks.move(await actorOf(req), key, number, input) });
  });

  router.delete('/:number', requirePermission('task:delete'), async (req, res) => {
    const { key, number } = parse(taskParams, req.params);
    await tasks.remove(await actorOf(req), key, number);
    res.status(204).end();
  });

  /* ---------- subtasks: part of editing the task ---------- */

  router.post('/:number/subtasks', requirePermission('task:update'), async (req, res) => {
    const { key, number } = parse(taskParams, req.params);
    const { title } = parse(createSubtaskInput, req.body);
    res.status(201).json({ task: await tasks.addSubtask(await actorOf(req), key, number, title) });
  });

  router.patch('/:number/subtasks/:subtaskId', requirePermission('task:update'), async (req, res) => {
    const { key, number, subtaskId } = parse(subtaskParams, req.params);
    const input = parse(updateSubtaskInput, req.body);
    res.json({ task: await tasks.updateSubtask(await actorOf(req), key, number, subtaskId, input) });
  });

  router.delete('/:number/subtasks/:subtaskId', requirePermission('task:update'), async (req, res) => {
    const { key, number, subtaskId } = parse(subtaskParams, req.params);
    res.json({ task: await tasks.deleteSubtask(await actorOf(req), key, number, subtaskId) });
  });

  /* ---------- comments ---------- */

  router.post('/:number/comments', requirePermission('comment:create'), async (req, res) => {
    const { key, number } = parse(taskParams, req.params);
    const { body } = parse(createCommentInput, req.body);
    res.status(201).json({ task: await tasks.addComment(await actorOf(req), key, number, body) });
  });

  // Own comments (or any, for Admins) — checked in the service.
  router.delete('/:number/comments/:commentId', async (req, res) => {
    const { key, number, commentId } = parse(commentParams, req.params);
    res.json({ task: await tasks.deleteComment(await actorOf(req), key, number, commentId) });
  });

  return router;
}

/** /api/projects/:key/board — the active sprint's cards. Reading follows project visibility. */
export function createBoardRouter(tasks: TasksService, { signedIn, actorOf }: Guards): Router {
  const router = Router({ mergeParams: true });
  router.use(signedIn);
  router.get('/', async (req, res) => {
    const { key } = parse(keyParam, req.params);
    res.json(await tasks.board(await actorOf(req), key));
  });
  return router;
}
