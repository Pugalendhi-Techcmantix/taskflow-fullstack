import type { SortDir, TaskListQuery, TaskPriority, TaskSort, TaskStatus, TaskType } from '@taskflow/core';

export type PersonRef = { id: string; name: string };

export type TaskRecord = {
  id: string;
  projectId: string;
  projectKey: string;
  number: number;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  points: number | null;
  assignee: PersonRef | null;
  reporter: PersonRef | null;
  sprint: { id: string; name: string } | null;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  doneAt: Date | null;
  /** Order inside its board column (sprint + status). */
  position: number;
  createdAt: Date;
  updatedAt: Date;
  subtaskTotal: number;
  subtaskDone: number;
  commentCount: number;
};

export type SubtaskRecord = { id: string; title: string; done: boolean; position: number };
export type CommentRecord = { id: string; author: PersonRef | null; body: string; mentionedUserIds: string[]; createdAt: Date };
export type TaskDetailRecord = TaskRecord & { subtasks: SubtaskRecord[]; comments: CommentRecord[] };

export type NewTask = {
  projectId: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  points: number | null;
  assigneeId: string | null;
  reporterId: string;
  sprintId: string | null;
  dueDate: string | null;
  doneAt: Date | null;
  position: number;
};

/** A board column: the tasks of one sprint (or the backlog, `sprintId: null`) with one status. */
export type Column = { projectId: string; sprintId: string | null; status: TaskStatus };

export type TaskChanges = Partial<{
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  points: number | null;
  assigneeId: string | null;
  sprintId: string | null;
  dueDate: string | null;
  doneAt: Date | null;
  position: number;
}>;

/**
 * Which tasks of a project a list shows. `q` matches the title or the key ("TF-10" finds TF-101…109),
 * ignoring case. A missing field means "all".
 */
export type TaskFilter = { projectId: string } & Pick<TaskListQuery, 'q' | 'status' | 'priority' | 'type' | 'assignee' | 'sprint'>;

/**
 * Status sorts in workflow order (To Do → Done), priority from Critical to Low, sprint by start date.
 * Empty values (no assignee, no points…) always come last. Ties are broken by task number.
 */
export type TaskOrder = { sort: TaskSort; dir: SortDir };

export interface TaskRepository {
  /** Oldest first (by number). */
  listByProject(projectId: string): Promise<TaskRecord[]>;
  /** How many tasks match the filter. */
  countMatching(filter: TaskFilter): Promise<number>;
  /** One page of matching tasks, in `order`. */
  listPage(filter: TaskFilter, order: TaskOrder, page: { offset: number; limit: number }): Promise<TaskRecord[]>;
  findByNumber(projectId: string, number: number): Promise<TaskDetailRecord | null>;
  findById(id: string): Promise<TaskRecord | null>;
  /** One sprint's tasks in board order (position, then number). */
  listBySprint(sprintId: string): Promise<TaskRecord[]>;
  /** The highest position in the column, or null if it is empty. */
  lastPosition(column: Column): Promise<number | null>;
  /** Spreads the column out again (POSITION_STEP apart, same order) when cards got too close. */
  renumberColumn(column: Column): Promise<void>;
  /** Takes the project's next number atomically: two simultaneous creates never share a key. */
  create(data: NewTask): Promise<TaskRecord>;
  update(id: string, changes: TaskChanges): Promise<TaskRecord>;
  delete(id: string): Promise<void>;
  /** userId → number of assigned tasks that are not Done (all projects). */
  countOpenByAssignee(): Promise<Map<string, number>>;

  /** Appends a subtask at the end of the task's checklist. */
  addSubtask(taskId: string, title: string): Promise<SubtaskRecord>;
  /** Null if the subtask is not part of this task. */
  updateSubtask(taskId: string, id: string, changes: { title?: string; done?: boolean }): Promise<SubtaskRecord | null>;
  deleteSubtask(taskId: string, id: string): Promise<boolean>;

  addComment(data: { taskId: string; authorId: string; body: string; mentionedUserIds: string[] }): Promise<CommentRecord>;
  /** Who wrote the comment, or null if it is not on this task. */
  findCommentAuthor(taskId: string, id: string): Promise<{ authorId: string | null } | null>;
  deleteComment(taskId: string, id: string): Promise<boolean>;
}
