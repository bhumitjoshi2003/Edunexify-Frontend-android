export function studentStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = { ACTIVE: 'Active', UPCOMING: 'Upcoming', GRADUATED: 'Graduated', TRANSFERRED: 'Transferred', WITHDRAWN: 'Withdrawn', INACTIVE: 'Inactive', ADMISSION_CANCELLED: 'Admission cancelled' };
  return labels[status?.toUpperCase() ?? ''] ?? 'Unknown';
}
export function studentStatusTone(status: string | undefined): string {
  const key = status?.toUpperCase();
  if (key === 'ACTIVE') return 'active';
  if (key === 'UPCOMING') return 'upcoming';
  if (['GRADUATED', 'TRANSFERRED', 'WITHDRAWN', 'INACTIVE', 'ADMISSION_CANCELLED'].includes(key ?? '')) return 'inactive';
  return 'unknown';
}
