export interface AdminProfileInput { name: string; email: string; phoneNumber: string; dob: string; gender?: string; }
export function normalizeAdminProfile(value: AdminProfileInput): AdminProfileInput {
  const gender = value.gender?.trim() ?? '';
  return { name: value.name?.trim(), email: value.email?.trim().toLowerCase(), phoneNumber: value.phoneNumber?.trim(),
    dob: value.dob, gender: gender ? gender[0].toUpperCase() + gender.slice(1).toLowerCase() : undefined };
}
export function adminProfileError(value: AdminProfileInput): string | null {
  const v = normalizeAdminProfile(value);
  if (!v.name || v.name.length > 255) return 'A name of up to 255 characters is required.';
  if (!v.email || v.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return 'Enter a valid email address.';
  if (!/^[0-9]{10}$/.test(v.phoneNumber ?? '')) return 'Phone number must contain exactly 10 digits.';
  const today = new Date(); const date = new Date(v.dob + 'T00:00:00');
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const roundTrip = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dob ?? '') || !Number.isFinite(date.getTime()) || roundTrip !== v.dob || v.dob < '1900-01-01' || date >= startOfToday) return 'Date of birth must be between 1900-01-01 and yesterday.';
  if (v.gender && !['Male', 'Female', 'Other'].includes(v.gender)) return 'Select a valid gender.';
  return null;
}
export function adminDomainError(error: any): string {
  const body = error?.error; return (typeof body === 'string' ? body : body?.message) || 'Could not save administrator details. Please try again.';
}
