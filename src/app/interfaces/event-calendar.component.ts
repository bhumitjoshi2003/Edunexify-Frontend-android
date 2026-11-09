export interface CalendarEvent {
    id?: number;
    title: string;
    description: string;
    startDate: string;
    endDate?: string | null;
    startTime?: string;
    endTime?: string;
    location?: string;
    category: string;
    targetAudience: string[];
    videoLinks?: string[];
    imageUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
}
/** Input fields only. Null/omitted endDate is normalized to startDate by the server. */
export interface EventWriteRequest {
    title: string; description: string; startDate: string; endDate?: string | null;
    startTime?: string | null; endTime?: string | null; location?: string; category: string;
    targetAudience: string[]; videoLinks?: string[]; imageUrl?: string | null;
}
