export type DeliveryChannel = 'PUSH' | 'EMAIL' | 'IN_APP';

/** Exactly what the backend persists, plus IN_APP's synthetic STORED (inbox row exists). */
export type DeliveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED_RETRYABLE'
  | 'FAILED_FINAL'
  | 'SKIPPED'
  | 'STORED';

export interface DeliveryRow {
  id: number;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  schoolId: number;
  schoolName: string | null;
  recipientUserId: string;
  recipientRole: string | null;
  notificationId: number;
  eventCode: string;
  title: string;
  attemptCount: number;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  nextAttemptAt: string | null;
  read: boolean | null;
  readAt: string | null;
}

export interface DeliveryRowPage {
  content: DeliveryRow[];
  page: number;
  size: number;
  hasNext: boolean;
}

export interface RelatedChannel {
  id: number;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  attemptCount: number;
  sentAt: string | null;
  lastError: string | null;
  read: boolean | null;
  readAt: string | null;
}

export interface DeliveryDetail {
  id: number;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  schoolId: number;
  schoolName: string | null;
  recipientUserId: string;
  recipientRole: string | null;
  maskedDestination: string | null;
  notificationId: number;
  eventCode: string;
  category: string | null;
  title: string;
  message: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: string;
  sentAt: string | null;
  nextAttemptAt: string | null;
  processingStartedAt: string | null;
  read: boolean | null;
  readAt: string | null;
  relatedChannels: RelatedChannel[];
}

export interface DeliveryFilters {
  notificationId?: number | null;
  status?: DeliveryStatus | null;
  channel?: DeliveryChannel | null;
  eventCode?: string | null;
  schoolId?: number | null;
  recipient?: string | null;
  from?: string | null;
  to?: string | null;
}

/**
 * Per-channel outcome counts for one notification. accepted = the provider accepted it (never a
 * delivery receipt); failed = gave up (permanent or retry limit); retrying = will retry;
 * skipped = not attempted; queued = waiting or sending.
 */
export interface ChannelCounts {
  total: number;
  accepted: number;
  failed: number;
  retrying: number;
  skipped: number;
  queued: number;
}

export interface InAppCounts {
  stored: number;
  opened: number;
  unopened: number;
}

/** One notification publication. push/email are null when that channel has no delivery rows. */
export interface DeliverySummaryRow {
  notificationId: number;
  schoolId: number | null;
  schoolName: string | null;
  eventCode: string;
  title: string;
  messagePreview: string | null;
  createdAt: string;
  totalRecipients: number;
  inApp: InAppCounts;
  push: ChannelCounts | null;
  email: ChannelCounts | null;
}

export interface DeliverySummaryPage {
  content: DeliverySummaryRow[];
  page: number;
  size: number;
  hasNext: boolean;
}

export interface SummaryFilters {
  eventCode?: string | null;
  schoolId?: number | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
}

export const DELIVERY_CHANNELS: { value: DeliveryChannel; label: string }[] = [
  { value: 'PUSH', label: 'Push' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'IN_APP', label: 'In-app' },
];

export const DELIVERY_STATUSES: DeliveryStatus[] =
  ['PENDING', 'PROCESSING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'SKIPPED', 'STORED'];

/**
 * Truthful labels: SENT only ever means the provider ACCEPTED the message — Edunexify has no
 * FCM or email delivery receipts, so nothing here claims "delivered". IN_APP "Opened" comes from
 * the user actually opening the inbox item (a real read timestamp), not a provider receipt.
 */
export function deliveryStatusLabel(status: DeliveryStatus, channel?: DeliveryChannel): string {
  switch (status) {
    case 'PENDING': return 'Queued';
    case 'PROCESSING': return 'Sending';
    case 'SENT':
      if (channel === 'PUSH') return 'Accepted by FCM';
      if (channel === 'EMAIL') return 'Accepted by mail server';
      return 'Accepted';
    case 'FAILED_RETRYABLE': return 'Retrying';
    case 'FAILED_FINAL': return 'Failed';
    case 'SKIPPED': return 'Skipped';
    case 'STORED': return 'In inbox';
  }
}

export function deliveryStatusMeaning(status: DeliveryStatus, channel: DeliveryChannel): string {
  switch (status) {
    case 'PENDING': return 'Waiting for the delivery worker to pick it up.';
    case 'PROCESSING': return 'A delivery worker has claimed it and is sending it now.';
    case 'SENT':
      return channel === 'PUSH'
        ? 'Firebase Cloud Messaging accepted the message for at least one of the recipient\'s registered devices. This does not confirm the device received or displayed it.'
        : 'The mail server accepted the email. This does not confirm it reached the inbox or was opened.';
    case 'FAILED_RETRYABLE': return 'The last attempt failed temporarily. It will be retried automatically.';
    case 'FAILED_FINAL': return 'Delivery stopped: a permanent failure, or the retry limit was reached.';
    case 'SKIPPED': return 'Not attempted — for example no registered device, no email address, or the recipient is inactive.';
    case 'STORED': return 'Saved to the recipient\'s in-app notification inbox.';
  }
}

export function deliveryChannelLabel(channel: DeliveryChannel): string {
  return DELIVERY_CHANNELS.find(c => c.value === channel)?.label ?? channel;
}

/** FEE_REMINDER → "Fee reminder". */
export function eventCodeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const words = code.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
