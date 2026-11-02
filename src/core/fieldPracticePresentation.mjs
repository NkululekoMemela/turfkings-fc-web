// Practice sessions last fifteen minutes. Reminders follow session time,
// so navigation or returning from the background cannot restart them.
export function practiceReminderVisible(expiresAt, now=Date.now()) {
  const expiry=typeof expiresAt==='number'?expiresAt:Date.parse(expiresAt);
  if(!Number.isFinite(expiry))return false;
  const elapsed=now-(expiry-15*60*1000);
  return elapsed>=0 && now<expiry && (elapsed<15000 || elapsed%60000<12000);
}
