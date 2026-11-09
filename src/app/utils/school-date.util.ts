/** Date-only domain values: never compare UTC midnight with local clock instants. */
export function schoolDateKey(now = new Date(), timezone = 'Asia/Kolkata'): string {
  if (!Number.isFinite(now.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: string) => parts.find(p => p.type === type)!.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch { return schoolDateKey(now, 'Asia/Kolkata'); }
}
export function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function studentExitDateError(leaving: string, joining: string | undefined, today: string): string | null {
  if (!validDateKey(leaving)) return 'Please set a valid leaving date.';
  if (leaving > today) return 'Leaving date cannot be in the future.';
  if (joining && validDateKey(joining) && leaving < joining) return "Leaving date cannot be before the student's joining date.";
  return null;
}
