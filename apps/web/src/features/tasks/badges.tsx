import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@taskflow/core';

/** Small coloured badges from the prototype. */
export const PriorityBadge = ({ priority }: { priority: TaskPriority }) => (
  <span className={`badge p-${priority}`}>{TASK_PRIORITY_LABELS[priority]}</span>
);

export const StatusBadge = ({ status }: { status: TaskStatus }) => (
  <span className={`badge s-${status}`}>{TASK_STATUS_LABELS[status]}</span>
);

const TYPE_LETTER: Record<TaskType, string> = { story: 'S', task: 'T', bug: '!' };

export const TypeIcon = ({ type }: { type: TaskType }) => (
  <span className={`type-icon type-${type}`} title={TASK_TYPE_LABELS[type]} role="img" aria-label={TASK_TYPE_LABELS[type]}>
    {TYPE_LETTER[type]}
  </span>
);
