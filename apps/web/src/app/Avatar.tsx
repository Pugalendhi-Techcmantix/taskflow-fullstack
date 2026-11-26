/** The prototype's 8 avatar colours. */
const AVATAR_COLORS = ['#4f46e5', '#0891b2', '#db2777', '#ea580c', '#16a34a', '#7c3aed', '#0d9488', '#ca8a04'] as const;

/** Same person → same colour, everywhere and on every device (derived from the user id). */
export function avatarColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

type Props = { id: string; name: string; size?: 'sm' | 'md' | 'lg'; title?: string };

/** Round initials badge. Decorative unless a title is given (the name is usually shown next to it). */
export function Avatar({ id, name, size = 'md', title }: Props) {
  return (
    <span className={`avatar ${size === 'md' ? '' : size}`} style={{ background: avatarColor(id) }} title={title} aria-hidden={title ? undefined : true}>
      {initials(name)}
    </span>
  );
}
