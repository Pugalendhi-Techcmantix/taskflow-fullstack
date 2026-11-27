import { useQuery } from '@tanstack/react-query';
import { Avatar } from '../../app/Avatar';
import { LoadError, SkeletonRows } from '../../app/feedback';
import { timeAgo } from '../../lib/dates';
import { activityKeys, fetchTaskHistory } from './activity-api';
import { describeActivity } from './describe';

/** "History" in the task dialog (prototype): every recorded change of this task, newest first. */
export function TaskHistory({ projectKey, number }: { projectKey: string; number: number }) {
  const history = useQuery({
    queryKey: activityKeys.task(projectKey, number),
    queryFn: ({ signal }) => fetchTaskHistory(projectKey, number, signal),
  });

  return (
    <section aria-labelledby="history-h">
      <h3 className="sub-h" id="history-h">History</h3>
      {history.status === 'pending' && <SkeletonRows rows={3} label="Loading history" />}
      {history.status === 'error' && <LoadError error={history.error} onRetry={() => void history.refetch()} />}
      {history.status === 'success' && history.data.entries.length === 0 && <p className="muted small">No changes recorded yet.</p>}
      {history.status === 'success' && history.data.entries.length > 0 && (
        <ol className="hist-list">
          {history.data.entries.map((e) => (
            <li key={e.id} className="hist">
              {e.actor ? <Avatar id={e.actor.id} name={e.actor.name} size="xs" /> : <span className="avatar xs more" aria-hidden="true">?</span>}
              <span>
                <b>{e.actor?.name ?? 'Someone'}</b> {describeActivity(e.event)} ·{' '}
                <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString('en-US')}>{timeAgo(e.createdAt)}</time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
