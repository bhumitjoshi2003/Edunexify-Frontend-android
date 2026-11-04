export type SupportTicketCategory =
  | 'LOGIN_ACCOUNT'
  | 'ATTENDANCE'
  | 'LEAVE'
  | 'TIMETABLE'
  | 'NOTIFICATIONS'
  | 'FEES_PAYMENTS'
  | 'APP_WEBSITE'
  | 'OTHER';

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type SupportPlatform = 'WEB' | 'ANDROID';

export interface CreateSupportTicketRequest {
  category: SupportTicketCategory;
  title: string;
  description: string;
  screenshotObjectKey?: string | null;
  screenshotObjectKeys?: string[] | null;
  route?: string | null;
  platform: SupportPlatform;
  appVersion?: string | null;
}

export interface StatusUpdateRequest {
  status: SupportTicketStatus;
  internalNote?: string | null;
}

export interface SupportTicketSummary {
  id: number;
  ticketNumber: string;
  schoolId: number;
  schoolName: string | null;
  reporterUserId: string;
  reporterName: string;
  reporterRole: string;
  category: SupportTicketCategory;
  title: string;
  status: SupportTicketStatus;
  platform: SupportPlatform;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  description: string;
  screenshotUrl: string | null;
  screenshotUrls: string[];
  route: string | null;
  appVersion: string | null;
  internalNote: string | null;
}

export interface SupportTicketPage<T> {
  content: T[];
  number: number;
  totalPages: number;
  totalElements: number;
  first: boolean;
  last: boolean;
}

export const SUPPORT_TICKET_CATEGORIES: { value: SupportTicketCategory; label: string }[] = [
  { value: 'LOGIN_ACCOUNT', label: 'Login & Account' },
  { value: 'ATTENDANCE', label: 'Attendance' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'TIMETABLE', label: 'Timetable' },
  { value: 'NOTIFICATIONS', label: 'Notifications' },
  { value: 'FEES_PAYMENTS', label: 'Fees & Payments' },
  { value: 'APP_WEBSITE', label: 'App / Website' },
  { value: 'OTHER', label: 'Other' },
];

const SUPPORT_TICKET_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};

export function supportCategoryLabel(category: SupportTicketCategory): string {
  return SUPPORT_TICKET_CATEGORIES.find(c => c.value === category)?.label ?? category;
}

export function supportStatusLabel(status: SupportTicketStatus): string {
  return SUPPORT_TICKET_STATUS_LABELS[status] ?? status;
}
