export function storyDateInput(ms = Date.now()) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return storyDateInput(Date.now());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function storyPublicationTime(value, now = Date.now()) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return now;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (storyDateInput(date.getTime()) !== raw) return now;
  // Choosing today means publish now, rather than silently waiting until noon.
  return raw === storyDateInput(now) ? now : date.getTime();
}
