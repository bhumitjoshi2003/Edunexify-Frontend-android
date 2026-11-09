/** Fee month values are academic ordinals; missing session dates must never imply April. */
export function feeMonthLabel(startDate: string | undefined, ordinal: number): string {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || ordinal < 1 || ordinal > 12)
    return `Academic month ${ordinal} (session dates unavailable)`;
  const [year, month] = startDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + ordinal - 1, 1));
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
export function feeAcademicMonth(startDate: string | undefined, today = new Date()): number {
  if (!startDate) return 0;
  const [year, month] = startDate.split('-').map(Number);
  return (today.getFullYear() - year) * 12 + today.getMonth() - (month - 1) + 1;
}
