import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { HttpDownloadProgressEvent, HttpEventType } from '@angular/common/http';
import { Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { AiCopilotService } from '../../services/ai-copilot.service';
import { AiWorkflowService, AttendanceReminderWorkflowResponse, FeeReminderWorkflowResponse, LeaveDecisionWorkflowResponse, TeacherAttendanceReminderWorkflowResponse } from '../../services/ai-workflow.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ChatMarkdownPipe } from '../../pipes/chat-markdown.pipe';
import { switchMap } from 'rxjs/operators';

export interface WorkflowCardData extends FeeReminderWorkflowResponse {
  /** UI-only — never sent to the backend. Drives the approve/reject buttons' local state. */
  actionState: 'idle' | 'sending' | 'error';
  actionError?: string;
}

export interface AttendanceWorkflowCardData extends AttendanceReminderWorkflowResponse {
  /** UI-only — never sent to the backend. Drives the approve/reject buttons' local state. */
  actionState: 'idle' | 'sending' | 'error';
  actionError?: string;
}

export interface TeacherAttendanceWorkflowCardData extends TeacherAttendanceReminderWorkflowResponse {
  /** UI-only — never sent to the backend. Drives the approve/reject buttons' local state. */
  actionState: 'idle' | 'sending' | 'error';
  actionError?: string;
}

export interface LeaveDecisionCardData extends LeaveDecisionWorkflowResponse {
  /** UI-only — never sent to the backend. Drives the approve/reject buttons' local state. */
  actionState: 'idle' | 'sending' | 'error';
  actionError?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error: boolean;
  /** Defaults to a plain text bubble when absent — see ai-copilot.component.html. */
  kind?: 'text' | 'fee_reminder_approval' | 'attendance_reminder_approval' | 'teacher_attendance_reminder_approval' | 'leave_decision_approval';
  workflow?: WorkflowCardData;
  attendanceWorkflow?: AttendanceWorkflowCardData;
  teacherAttendanceWorkflow?: TeacherAttendanceWorkflowCardData;
  leaveWorkflow?: LeaveDecisionCardData;
}

@Component({
  selector: 'app-ai-copilot',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ChatMarkdownPipe, DatePipe],
  templateUrl: './ai-copilot.component.html',
  styleUrl: './ai-copilot.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiCopilotComponent implements OnInit, OnDestroy, AfterViewChecked {
  private destroy$ = new Subject<void>();
  private readonly visualViewportHandler = () => this.syncVisualViewport();
  private shouldScroll = false;
  private lastUserMessage = '';
  private currentRequest?: Subscription;

  @ViewChild('messagesEl') messagesEl!: ElementRef<HTMLElement>;
  @ViewChild('inputEl')    inputEl!:    ElementRef<HTMLTextAreaElement>;

  isOpen       = false;
  messages: ChatMessage[] = [];
  inputText    = '';
  isLoading    = false;
  // True for the whole request lifetime (send → final chunk/error/stop), unlike isLoading
  // which only covers the gap before the first chunk arrives (drives the typing dots).
  // Governs the send-vs-stop button swap and blocks starting a second concurrent request.
  isStreaming  = false;
  showNewBadge = false;
  showPulse    = false;

  // Scopes short-term server-side memory (see edunexify-ai/memory.py). A fresh
  // conversationId per "New chat" means fresh (empty) memory for that chat.
  conversationId = crypto.randomUUID();

  constructor(
    private aiService:      AiCopilotService,
    private workflowService: AiWorkflowService,
    private sessionService:  AcademicSessionService,
    private authState:      AuthStateService,
    private cdr:            ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    window.visualViewport?.addEventListener('resize', this.visualViewportHandler);
    window.visualViewport?.addEventListener('scroll', this.visualViewportHandler);
    this.syncVisualViewport();

    if (!localStorage.getItem('edu_copilot_seen')) {
      this.showNewBadge = true;
      this.showPulse    = true;
    }
  }

  ngOnDestroy(): void {
    window.visualViewport?.removeEventListener('resize', this.visualViewportHandler);
    window.visualViewport?.removeEventListener('scroll', this.visualViewportHandler);
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
  }

  // ── Derived user info ──────────────────────────────────────────────────────

  get firstName(): string {
    const name = this.authState.getUser()?.name;
    if (!name) return this.authState.getUser()?.userId ?? 'there';
    return name.split(' ')[0];
  }

  get userRole(): string {
    return this.authState.getUserRole();
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      STUDENT: 'Student', TEACHER: 'Teacher',
      ADMIN: 'Admin', SUB_ADMIN: 'Sub-Admin', SUPER_ADMIN: 'Super Admin',
    };
    return map[this.userRole] ?? this.userRole;
  }

  /** Backend independently enforces ADMIN/SUPER_ADMIN on every workflow endpoint — this
   * getter is a UX guard only, same convention as auth-state.service.ts's hasPermission(). */
  get isAdmin(): boolean {
    return this.userRole === 'ADMIN' || this.userRole === 'SUPER_ADMIN';
  }

  get welcomeDesc(): string {
    if (this.userRole === 'STUDENT') {
      return 'Ask me about your fees, attendance, exam results, or anything else about your school.';
    }
    if (this.userRole === 'TEACHER') {
      return 'Ask me about your class, students, or how to use Edunexify features.';
    }
    return 'Ask me anything about school data or Edunexify features.';
  }

  get suggestedPrompts(): { icon: string; text: string; action?: 'startFeeReminders' | 'startAttendanceReminders' | 'startTeacherAttendanceReminders' }[] {
    if (this.userRole === 'STUDENT') {
      return [
        { icon: '🏆', text: 'How did I perform in my latest exam?' },
        { icon: '📅', text: 'What is my attendance this year?' },
        { icon: '💰', text: 'Do I have any pending fees?' },
        { icon: '📊', text: 'Give me a full overview of my progress' },
      ];
    }
    if (this.isAdmin) {
      return [
        { icon: '📋', text: 'Review fee reminder batch', action: 'startFeeReminders' },
        { icon: '📅', text: 'Review attendance reminder batch', action: 'startAttendanceReminders' },
        { icon: '💡', text: 'What can you help me with?' },
      ];
    }
    if (this.userRole === 'TEACHER') {
      return [
        { icon: '📅', text: 'Review my class attendance reminder batch', action: 'startTeacherAttendanceReminders' },
        { icon: '💡', text: 'What can you help me with?' },
        { icon: '📚', text: 'Tell me about Edunexify features' },
      ];
    }
    return [
      { icon: '💡', text: 'What can you help me with?' },
      { icon: '📚', text: 'Tell me about Edunexify features' },
    ];
  }

  onSuggestedPromptClick(prompt: { text: string; action?: 'startFeeReminders' | 'startAttendanceReminders' | 'startTeacherAttendanceReminders' }): void {
    if (prompt.action === 'startFeeReminders') {
      this.startFeeReminderWorkflow();
    } else if (prompt.action === 'startAttendanceReminders') {
      this.startAttendanceReminderWorkflow();
    } else if (prompt.action === 'startTeacherAttendanceReminders') {
      this.startTeacherAttendanceReminderWorkflow();
    } else {
      this.sendMessage(prompt.text);
    }
  }

  // ── Panel open / close ─────────────────────────────────────────────────────

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  open(): void {
    this.syncVisualViewport();
    this.isOpen       = true;
    this.showNewBadge = false;
    this.showPulse    = false;
    localStorage.setItem('edu_copilot_seen', '1');
    this.cdr.markForCheck();
    setTimeout(() => { this.inputEl?.nativeElement?.focus(); }, 340);
  }

  close(): void {
    this.isOpen = false;
    this.cdr.markForCheck();
  }

  clearChat(): void {
    this.messages        = [];
    this.lastUserMessage = '';
    this.conversationId  = crypto.randomUUID();
    this.cdr.markForCheck();
    setTimeout(() => this.inputEl?.nativeElement?.focus(), 50);
  }

  // ── Input handlers ─────────────────────────────────────────────────────────

  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) return;

    // Phones/tablets do not have a practical Shift+Enter gesture. On narrow mobile
    // layouts, Enter must therefore remain the textarea's normal newline key; users
    // send explicitly with the arrow button. Desktop keeps the familiar chat behavior.
    if (this.isMobileComposer()) return;

    if (!event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private isMobileComposer(): boolean {
    return window.matchMedia?.('(max-width: 720px)').matches ?? window.innerWidth <= 720;
  }

  /** Keep the full-screen mobile Copilot attached to the *visible* viewport. Mobile browsers
   * can pan the visual viewport when the keyboard opens; without compensating for offsetTop,
   * the fixed header can move above the visible screen even though the panel itself is fixed. */
  private syncVisualViewport(): void {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    if (!viewport || !this.isMobileComposer()) {
      root.style.removeProperty('--cp-viewport-top');
      root.style.removeProperty('--cp-viewport-height');
      return;
    }
    root.style.setProperty('--cp-viewport-top', `${viewport.offsetTop}px`);
    root.style.setProperty('--cp-viewport-height', `${viewport.height}px`);
  }

  onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  sendMessage(text?: string): void {
    const content = (text ?? this.inputText).trim();
    if (!content || this.isStreaming) return;

    this.lastUserMessage = content;
    this.inputText       = '';

    if (this.inputEl?.nativeElement) {
      this.inputEl.nativeElement.style.height = 'auto';
    }

    this.messages = [
      ...this.messages,
      { id: `u_${Date.now()}`, role: 'user', content, timestamp: new Date(), error: false },
    ];
    this.isLoading    = true;
    this.isStreaming  = true;
    this.shouldScroll = true;
    this.cdr.markForCheck();

    // Populated on the first chunk that actually arrives, so the typing
    // indicator stays visible for any gap before generation starts (e.g. while
    // tool calls are resolving server-side — those never reach the client as
    // text, see routers/chat.py, so this bubble only appears once real content does).
    let assistantMsg: ChatMessage | null = null;
    let receivedSoFar = '';

    this.currentRequest = this.aiService.sendStream(content, this.conversationId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.DownloadProgress) {
          const partialText = (event as HttpDownloadProgressEvent).partialText ?? '';
          const delta = partialText.slice(receivedSoFar.length);
          receivedSoFar = partialText;
          if (!delta) return;

          // A workflow response (see routers/chat.py's start_fee_reminder_workflow
          // short-circuit) is ONE complete JSON object, never interleaved with prose —
          // so if the body looks like it's building one, hold off rendering anything
          // until the stream completes and the whole thing can be parsed, rather than
          // flashing raw JSON text into the bubble character by character.
          if (this.looksLikeStructuredPayload(receivedSoFar)) return;

          if (!assistantMsg) {
            assistantMsg = { id: `a_${Date.now()}`, role: 'assistant', content: '', timestamp: new Date(), error: false };
            this.messages = [...this.messages, assistantMsg];
            this.isLoading = false;
          }
          assistantMsg.content += delta;
          this.shouldScroll = true;
          this.cdr.markForCheck();
          return;
        }

        if (event.type === HttpEventType.Response) {
          // event.body is the full accumulated text for the turn.
          const finalText = (event.body as string)?.trim() ?? '';
          const card = this.tryParseWorkflowMessage(finalText);

          if (card) {
            // A card supersedes anything the model narrated on the way to producing it — drop
            // the partially-streamed bubble rather than leaving prose with raw JSON stuck on
            // the end. (Nothing to drop in the usual case, where the body was only the payload.)
            if (assistantMsg) {
              const streamed = assistantMsg;
              this.messages = this.messages.filter(m => m !== streamed);
            }
            this.messages = [...this.messages, card];
          } else if (!assistantMsg) {
            // A very short/instant reply that never crossed the DownloadProgress threshold.
            this.messages = [
              ...this.messages,
              {
                id: `a_${Date.now()}`,
                role: 'assistant',
                content: finalText || "I wasn't able to complete your request. Please try again.",
                timestamp: new Date(),
                error: false,
              },
            ];
          }
          this.isLoading    = false;
          this.shouldScroll = true;
          this.cdr.markForCheck();
        }
      },
      error: () => {
        if (assistantMsg) {
          // Partial content already showing — keep it, and note the stream broke,
          // rather than discarding what the user has already read.
          assistantMsg.content += '\n\n⚠️ Connection lost — response may be incomplete.';
          assistantMsg.error = true;
        } else {
          this.messages = [
            ...this.messages,
            {
              id: `e_${Date.now()}`,
              role: 'assistant',
              content: 'Something went wrong. Please check your connection and try again.',
              timestamp: new Date(),
              error: true,
            },
          ];
        }
        this.isLoading    = false;
        this.isStreaming  = false;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      complete: () => {
        this.isLoading   = false;
        this.isStreaming = false;
        this.cdr.markForCheck();
      },
    });
  }

  /** User hit the stop button mid-stream. Cancels the underlying XHR — Spring/FastAPI
   * detect the dropped connection and stop pulling more tokens (see routers/chat.py's
   * is_disconnected() check). Whatever text already arrived stays in the bubble as-is. */
  stopGenerating(): void {
    this.currentRequest?.unsubscribe();
    this.currentRequest = undefined;
    this.isLoading    = false;
    this.isStreaming  = false;
    this.shouldScroll = true;
    this.cdr.markForCheck();
  }

  retry(): void {
    if (!this.lastUserMessage || this.isStreaming) return;
    // Drop the last error message, then resend
    this.messages = this.messages.slice(0, -1);
    this.sendMessage(this.lastUserMessage);
  }

  // ── Structured workflow responses arriving via /chat/stream ──────────────────
  //
  // Small, backward-compatible extension to the chat protocol, not a rewrite: the
  // transport (chunked text/plain, HttpDownloadProgressEvent) is unchanged. The only new
  // behavior is that a turn's FULL body may, instead of prose, be one self-describing JSON
  // object ({"kind": "fee_reminder_workflow", ...}) when the admin's message caused the
  // model to call start_fee_reminder_workflow — see routers/chat.py. No sentinels, no
  // header/trailer tricks: it's parsed with plain JSON.parse and a discriminator field,
  // exactly like ChatMessage.kind already discriminates rendering client-side.

  private looksLikeStructuredPayload(text: string): boolean {
    return text.trimStart().startsWith('{');
  }

  /**
   * Pulls the workflow payload out of a turn's full body.
   *
   * Usually the body IS the payload and nothing else. But a turn that needs a read tool before
   * the workflow tool (leave decisions always do — the requests must be looked up before they
   * can be acted on) gives the model an opening to narrate the read results first, and that
   * prose is already streamed by the time the workflow tool runs. Bytes on the wire can't be
   * recalled, so the payload arrives appended to the prose instead of alone.
   *
   * Rather than trust the model never to narrate, take the last balanced {...} in the body and
   * see if it's ours. The card supersedes the narration either way, so the prose is dropped.
   */
  private extractWorkflowPayload(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed.endsWith('}')) return null;

    // Walk back from the end, tracking brace depth, to find where this object began. String
    // literals are skipped so a `{` inside a reason or student name can't throw the count off.
    let depth = 0, inString = false, escaped = false;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '}') depth++;
      else if (ch === '{') {
        depth--;
        if (depth === 0) return trimmed.slice(i);
      }
    }
    return null;
  }

  private tryParseWorkflowMessage(text: string): ChatMessage | null {
    const payload = this.looksLikeStructuredPayload(text) ? text : this.extractWorkflowPayload(text);
    if (!payload) return null;
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.kind === 'fee_reminder_workflow') {
        return {
          id: `wf_${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          error: false,
          kind: 'fee_reminder_approval',
          workflow: { ...parsed, actionState: 'idle' },
        };
      }
      if (parsed?.kind === 'attendance_reminder_workflow') {
        return {
          id: `wf_${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          error: false,
          kind: 'attendance_reminder_approval',
          attendanceWorkflow: { ...parsed, actionState: 'idle' },
        };
      }
      if (parsed?.kind === 'leave_decision_workflow') {
        return {
          id: `wf_${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          error: false,
          kind: 'leave_decision_approval',
          leaveWorkflow: { ...parsed, actionState: 'idle' },
        };
      }
      if (parsed?.kind === 'teacher_attendance_reminder_workflow') {
        return {
          id: `wf_${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          error: false,
          kind: 'teacher_attendance_reminder_approval',
          teacherAttendanceWorkflow: { ...parsed, actionState: 'idle' },
        };
      }
      return null;
    } catch {
      return null; // looked like JSON but wasn't (or wasn't ours) — render as plain text instead
    }
  }

  // ── Fee reminder workflow (LangGraph, human-in-the-loop) ────────────────────
  //
  // Deliberately NOT routed through sendMessage()/the LLM tool-calling loop — this is a
  // plain, deterministic POST that starts the workflow up to its approval pause and
  // renders the result directly as a card. No free-text/LLM step is involved in *starting*
  // it, so there's no risk of the model ever deciding on its own to send anything; the
  // send-with-approval boundary is enforced entirely by which buttons the admin clicks
  // below, each hitting its own explicit backend endpoint.

  startFeeReminderWorkflow(): void {
    if (this.isStreaming) return;
    this.isLoading    = true;
    this.shouldScroll = true;
    this.cdr.markForCheck();

    this.sessionService.getCurrentSession().pipe(
      switchMap(session => this.workflowService.startFeeReminderWorkflow(session.label)),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (result) => {
        this.messages = [
          ...this.messages,
          {
            id: `wf_${Date.now()}`,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            error: false,
            kind: 'fee_reminder_approval',
            workflow: { ...result, actionState: 'idle' },
          },
        ];
        this.isLoading    = false;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.messages = [
          ...this.messages,
          {
            id: `e_${Date.now()}`,
            role: 'assistant',
            content: err?.error?.error || 'Could not start the fee reminder review. Please try again.',
            timestamp: new Date(),
            error: true,
          },
        ];
        this.isLoading    = false;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
    });
  }

  approveWorkflow(msg: ChatMessage): void {
    this.resumeWorkflow(msg, wf => this.workflowService.approve(wf.workflowId));
  }

  rejectWorkflow(msg: ChatMessage): void {
    this.resumeWorkflow(msg, wf => this.workflowService.reject(wf.workflowId));
  }

  private resumeWorkflow(
    msg: ChatMessage,
    call: (wf: WorkflowCardData) => Observable<FeeReminderWorkflowResponse>,
  ): void {
    const wf = msg.workflow;
    if (!wf || wf.actionState === 'sending') return;

    wf.actionState = 'sending';
    wf.actionError = undefined;
    this.cdr.markForCheck();

    call(wf).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        msg.workflow = { ...result, actionState: 'idle' };
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        wf.actionState = 'error';
        wf.actionError = err?.error?.error || 'Something went wrong. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  // ── Attendance reminder workflow (LangGraph, human-in-the-loop) ─────────────
  //
  // Structurally identical to the fee reminder workflow above — kept as separate methods
  // rather than parameterizing resumeWorkflow further, since the two card types live on
  // different ChatMessage fields (workflow vs attendanceWorkflow) and different response
  // shapes (FeeReminderWorkflowResponse vs AttendanceReminderWorkflowResponse).

  startAttendanceReminderWorkflow(): void {
    if (this.isStreaming) return;
    this.isLoading    = true;
    this.shouldScroll = true;
    this.cdr.markForCheck();

    this.sessionService.getCurrentSession().pipe(
      switchMap(session => this.workflowService.startAttendanceReminderWorkflow(session.label)),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (result) => {
        this.messages = [
          ...this.messages,
          {
            id: `awf_${Date.now()}`,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            error: false,
            kind: 'attendance_reminder_approval',
            attendanceWorkflow: { ...result, actionState: 'idle' },
          },
        ];
        this.isLoading    = false;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.messages = [
          ...this.messages,
          {
            id: `e_${Date.now()}`,
            role: 'assistant',
            content: err?.error?.error || 'Could not start the attendance reminder review. Please try again.',
            timestamp: new Date(),
            error: true,
          },
        ];
        this.isLoading    = false;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
    });
  }

  approveAttendanceWorkflow(msg: ChatMessage): void {
    this.resumeAttendanceWorkflow(msg, wf => this.workflowService.approveAttendance(wf.workflowId));
  }

  rejectAttendanceWorkflow(msg: ChatMessage): void {
    this.resumeAttendanceWorkflow(msg, wf => this.workflowService.rejectAttendance(wf.workflowId));
  }

  private resumeAttendanceWorkflow(
    msg: ChatMessage,
    call: (wf: AttendanceWorkflowCardData) => Observable<AttendanceReminderWorkflowResponse>,
  ): void {
    const wf = msg.attendanceWorkflow;
    if (!wf || wf.actionState === 'sending') return;

    wf.actionState = 'sending';
    wf.actionError = undefined;
    this.cdr.markForCheck();

    call(wf).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        msg.attendanceWorkflow = { ...result, actionState: 'idle' };
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        wf.actionState = 'error';
        wf.actionError = err?.error?.error || 'Something went wrong. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  // ── Teacher-scoped attendance reminder workflow (LangGraph, human-in-the-loop) ──
  //
  // Structurally identical to the admin attendance workflow above — kept as separate
  // methods for the same reason (different ChatMessage field, different response shape).
  // No className is ever passed here: the backend resolves it from the teacher's own
  // classTeacher field (see AiTeacherAttendanceWorkflowController.start) — there's no
  // parameter here that could widen it.

  startTeacherAttendanceReminderWorkflow(): void {
    if (this.isStreaming) return;
    this.isLoading    = true;
    this.shouldScroll = true;
    this.cdr.markForCheck();

    this.sessionService.getCurrentSession().pipe(
      switchMap(session => this.workflowService.startTeacherAttendanceReminderWorkflow(session.label)),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (result) => {
        this.messages = [
          ...this.messages,
          {
            id: `twf_${Date.now()}`,
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            error: false,
            kind: 'teacher_attendance_reminder_approval',
            teacherAttendanceWorkflow: { ...result, actionState: 'idle' },
          },
        ];
        this.isLoading    = false;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.messages = [
          ...this.messages,
          {
            id: `e_${Date.now()}`,
            role: 'assistant',
            content: err?.error?.error || 'Could not start the attendance reminder review. Please try again.',
            timestamp: new Date(),
            error: true,
          },
        ];
        this.isLoading    = false;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
    });
  }

  approveTeacherAttendanceWorkflow(msg: ChatMessage): void {
    this.resumeTeacherAttendanceWorkflow(msg, wf => this.workflowService.approveTeacherAttendance(wf.workflowId));
  }

  rejectTeacherAttendanceWorkflow(msg: ChatMessage): void {
    this.resumeTeacherAttendanceWorkflow(msg, wf => this.workflowService.rejectTeacherAttendance(wf.workflowId));
  }

  private resumeTeacherAttendanceWorkflow(
    msg: ChatMessage,
    call: (wf: TeacherAttendanceWorkflowCardData) => Observable<TeacherAttendanceReminderWorkflowResponse>,
  ): void {
    const wf = msg.teacherAttendanceWorkflow;
    if (!wf || wf.actionState === 'sending') return;

    wf.actionState = 'sending';
    wf.actionError = undefined;
    this.cdr.markForCheck();

    call(wf).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        msg.teacherAttendanceWorkflow = { ...result, actionState: 'idle' };
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        wf.actionState = 'error';
        wf.actionError = err?.error?.error || 'Something went wrong. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  // ── Leave decision workflow (LangGraph, human-in-the-loop) ──────────────────
  //
  // No start method here on purpose, unlike the reminder workflows. A leave decision always
  // targets specific requests, so it can only originate from a conversation where those
  // requests were actually looked up — there is no "review leave batch" quick-action button
  // that could start one without the user having named anything.

  approveLeaveWorkflow(msg: ChatMessage): void {
    this.resumeLeaveWorkflow(msg, wf => this.workflowService.approveLeaveDecision(wf.workflowId));
  }

  rejectLeaveWorkflow(msg: ChatMessage): void {
    this.resumeLeaveWorkflow(msg, wf => this.workflowService.rejectLeaveDecision(wf.workflowId));
  }

  private resumeLeaveWorkflow(
    msg: ChatMessage,
    call: (wf: LeaveDecisionCardData) => Observable<LeaveDecisionWorkflowResponse>,
  ): void {
    const wf = msg.leaveWorkflow;
    if (!wf || wf.actionState === 'sending') return;

    wf.actionState = 'sending';
    wf.actionError = undefined;
    this.cdr.markForCheck();

    call(wf).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        msg.leaveWorkflow = { ...result, actionState: 'idle' };
        this.shouldScroll = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        wf.actionState = 'error';
        wf.actionError = err?.error?.error || 'Something went wrong. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  // ── Scroll ─────────────────────────────────────────────────────────────────

  trackById(_: number, msg: ChatMessage): string { return msg.id; }

  private scrollToBottom(): void {
    try {
      const el = this.messagesEl?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { /* noop */ }
  }
}
