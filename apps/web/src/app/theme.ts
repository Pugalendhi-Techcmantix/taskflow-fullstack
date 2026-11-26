/** Light/dark theme. The saved choice is applied before first paint by a script in index.html. */
export function toggleTheme(): void {
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? '' : 'dark';
  if (next) root.dataset.theme = next;
  else delete root.dataset.theme;
  try {
    if (next) localStorage.setItem('tf-theme', next);
    else localStorage.removeItem('tf-theme');
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this visit.
  }
}
