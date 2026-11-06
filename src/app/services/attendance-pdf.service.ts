import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SchoolService } from './school.service';
import { AttendanceService } from './attendance.service';
import { StudentAttendanceSummary, ClassAttendanceSummary, MonthlyBreakdown, DailyDetail } from '../interfaces/attendance-summary';

interface NativePdfDownloads {
  saveToDownloads(options: { data: string; fileName: string }): Promise<{ uri: string; fileName: string; bytes: number }>;
}
const nativePdfDownloads = registerPlugin<NativePdfDownloads>('ReportCardPdf');

const NAVY: [number, number, number] = [16, 59, 80];
const TEAL: [number, number, number] = [4, 120, 87];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [226, 232, 240];
const PALE: [number, number, number] = [241, 245, 249];
const RED: [number, number, number] = [185, 28, 28];

type ReportDocument = jsPDF;
type SchoolIdentity = { name: string; logoUrl?: string | null };
type ReportColumn = { label: string; width: number; align?: 'left' | 'right' | 'center' };

@Injectable({ providedIn: 'root' })
export class AttendancePdfService {
  constructor(
    private readonly schools: SchoolService,
    private readonly attendance: AttendanceService
  ) {}

  async studentReport(summary: StudentAttendanceSummary, period: string, month?: { month: number; year: number }, action: 'download' | 'share' = 'download'): Promise<void> {
    const school = await this.schoolIdentity();
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const w = 210;
    let y = await this.header(pdf, w, school, 'STUDENT ATTENDANCE REPORT', period);
    y = this.identity(pdf, `Student: ${summary.studentName}`, `Class: ${summary.className || 'Not specified'}  |  ID: ${summary.studentId}`, y);
    y = this.metrics(pdf, [
      ['WORKING DAYS', summary.totalWorkingDays.toString()],
      ['PRESENT', summary.daysPresent.toString()],
      ['ABSENT', summary.daysAbsent.toString()],
      ['ATTENDANCE', this.percent(summary.attendancePercentage, summary.totalWorkingDays)]
    ], y, w);
    if (summary.approvedLeaveDays > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...MUTED);
      pdf.setFontSize(9);
      pdf.text(`Approved leave: ${summary.approvedLeaveDays} day(s), included in absences.`, 16, y);
      y += 9;
    }
    if (month) {
      try {
        const detail = await firstValueFrom(this.attendance.getStudentDailyDetail(summary.studentId, month.month, month.year));
        y = this.monthCalendar(pdf, month.month, month.year, detail, y, w);
      } catch {
        pdf.setFontSize(9);
        pdf.setTextColor(...MUTED);
        pdf.text('Daily detail is unavailable. Summary statistics are shown above.', 16, y);
        y += 9;
      }
    } else if (summary.monthlyBreakdown?.length) {
      y = this.section(pdf, 'MONTH-BY-MONTH BREAKDOWN', y);
      const rows = summary.monthlyBreakdown
        .filter(m => m.workingDays > 0)
        .map(m => [`${m.month} ${m.year}`, String(m.workingDays), String(m.present), String(m.absent), this.percent(m.percentage, m.workingDays)]);
      if (!rows.length) {
        pdf.setTextColor(...MUTED);
        pdf.setFontSize(10);
        pdf.text('No attendance recorded for this period.', 16, y);
      } else {
        this.table(pdf, rows, [
          { label: 'Month', width: 64 },
          { label: 'Working', width: 30, align: 'center' },
          { label: 'Present', width: 30, align: 'center' },
          { label: 'Absent', width: 27, align: 'center' },
          { label: 'Rate', width: 27, align: 'right' }
        ], y, w, school, 'STUDENT ATTENDANCE REPORT', period);
      }
    }
    this.footers(pdf, w);
    await this.deliver(pdf, `Attendance_${this.fileSafe(summary.studentName)}_${this.fileSafe(period)}.pdf`, action);
  }

  async classReport(students: ClassAttendanceSummary[], className: string, sectionName: string, period: string, action: 'download' | 'share' = 'download'): Promise<void> {
    if (!students.length) throw new Error('No class report is loaded.');
    const school = await this.schoolIdentity();
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const w = 297;
    let y = await this.header(pdf, w, school, 'CLASS ATTENDANCE REPORT', period);
    y = this.identity(pdf, `Class: ${className}  |  ${sectionName}`, `${students.length} students  |  ${period}`, y);
    const totalWorking = students.reduce((n, s) => n + s.totalWorkingDays, 0);
    const totalPresent = students.reduce((n, s) => n + s.daysPresent, 0);
    const avg = totalWorking ? Math.round(totalPresent / totalWorking * 1000) / 10 : 0;
    const low = students.filter(s => s.totalWorkingDays > 0 && s.attendancePercentage < 75).length;
    y = this.metrics(pdf, [
      ['STUDENTS', String(students.length)],
      ['OVERALL ATTENDANCE', this.percent(avg, totalWorking)],
      ['BELOW 75%', String(low)],
      ['TOTAL ABSENCES', String(students.reduce((n, s) => n + s.daysAbsent, 0))]
    ], y, w);
    y = this.section(pdf, 'STUDENT ATTENDANCE REGISTER', y);
    this.table(pdf, students.map((s, i) => [
      String(i + 1), s.studentName, s.studentId, String(s.totalWorkingDays),
      String(s.daysPresent), String(s.daysAbsent), String(s.approvedLeaveDays),
      this.percent(s.attendancePercentage, s.totalWorkingDays)
    ]), [
      { label: '#', width: 12, align: 'center' },
      { label: 'Student', width: 73 },
      { label: 'Student ID', width: 48 },
      { label: 'Working', width: 27, align: 'center' },
      { label: 'Present', width: 27, align: 'center' },
      { label: 'Absent', width: 27, align: 'center' },
      { label: 'Leave*', width: 27, align: 'center' },
      { label: 'Rate', width: 24, align: 'right' }
    ], y, w, school, 'CLASS ATTENDANCE REPORT', period);
    this.footers(pdf, w, '*Approved leave is included in absent days.');
    await this.deliver(pdf, `Attendance_Class_${this.fileSafe(className)}_${this.fileSafe(period)}.pdf`, action);
  }

  private async schoolIdentity(): Promise<SchoolIdentity> {
    try {
      const s = await firstValueFrom(this.schools.getSettings());
      return { name: s.name || 'School Attendance Report', logoUrl: s.logoUrl };
    } catch {
      return { name: 'School Attendance Report' };
    }
  }

  private async header(pdf: ReportDocument, width: number, school: SchoolIdentity, title: string, period: string): Promise<number> {
    pdf.setFillColor(...NAVY);
    pdf.rect(0, 0, width, 37, 'F');
    pdf.setFillColor(16, 185, 129);
    pdf.rect(0, 37, width, 1.7, 'F');
    // The identity is always legible, even when the optional logo URL fails/CORS blocks it.
    let textX = 17;
    if (school.logoUrl) {
      const logo = await this.readLogo(school.logoUrl);
      if (logo) {
        try { pdf.addImage(logo, 'PNG', 16, 7, 21, 21, undefined, 'FAST'); textX = 43; } catch { /* Keep text-only branding. */ }
      }
    }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(this.fit(pdf, school.name, width - textX - 17), textX, 16);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(title, textX, 24);
    pdf.setFontSize(8.5);
    pdf.setTextColor(217, 237, 243);
    pdf.text(period, textX, 31);
    return 48;
  }

  private async readLogo(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, { credentials: 'omit', mode: 'cors' });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Logo decoding failed'));
        reader.readAsDataURL(blob);
      });
      return data;
    } catch { return null; }
  }

  private identity(pdf: ReportDocument, name: string, detail: string, y: number): number {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...INK);
    pdf.text(name, 16, y + 1);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTED);
    pdf.text(detail, 16, y + 8);
    return y + 18;
  }

  private metrics(pdf: ReportDocument, items: [string, string][], y: number, width: number): number {
    const left = 16;
    const gap = 3;
    const bw = (width - 32 - 3 * gap) / 4;
    items.forEach(([label, value], i) => {
      const x = left + i * (bw + gap);
      pdf.setFillColor(...PALE);
      pdf.roundedRect(x, y, bw, 24, 2, 2, 'F');
      pdf.setFillColor(...TEAL);
      pdf.rect(x, y + 3, 1, 18, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.setTextColor(...INK);
      pdf.text(value, x + bw / 2, y + 11, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...MUTED);
      pdf.text(label, x + bw / 2, y + 18, { align: 'center' });
    });
    return y + 34;
  }

  private section(pdf: ReportDocument, label: string, y: number): number {
    pdf.setTextColor(...NAVY);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(label, 16, y);
    pdf.setDrawColor(...BORDER);
    pdf.line(16, y + 3, pdf.internal.pageSize.getWidth() - 16, y + 3);
    return y + 10;
  }

  private table(pdf: ReportDocument, rows: string[][], cols: ReportColumn[], startY: number, width: number,
    school: SchoolIdentity, title: string, period: string): void {
    const left = 16;
    const rowHeight = 9;
    let y = startY;
    const pageHeight = pdf.internal.pageSize.getHeight();
    const drawHead = () => {
      pdf.setFillColor(...NAVY);
      pdf.rect(left, y, width - 32, 10, 'F');
      let x = left;
      cols.forEach(col => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        const at = col.align === 'right' ? x + col.width - 3 : col.align === 'center' ? x + col.width / 2 : x + 3;
        pdf.text(col.label, at, y + 6.5, { align: col.align || 'left' });
        x += col.width;
      });
      y += 10;
    };
    drawHead();
    rows.forEach((row, i) => {
      if (y + rowHeight > pageHeight - 18) {
        pdf.addPage();
        // Compact continuation header, with the same school and report identity.
        pdf.setFillColor(...NAVY);
        pdf.rect(0, 0, width, 22, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(255, 255, 255);
        pdf.text(this.fit(pdf, school.name + '  |  ' + title, width - 32), 16, 11);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(period + '  -  Continued', 16, 17);
        y = 29;
        drawHead();
      }
      if (i % 2 === 0) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(left, y, width - 32, rowHeight, 'F');
      }
      let x = left;
      row.forEach((cell, j) => {
        const col = cols[j];
        const available = col.width - 6;
        pdf.setFont('helvetica', j === 0 && cols.length === 5 ? 'bold' : 'normal');
        pdf.setFontSize(8.4);
        const isRate = j === row.length - 1;
        const rateValue = Number.parseFloat(cell);
        const isLow = isRate && cell !== 'Not recorded' && Number.isFinite(rateValue) && rateValue < 75;
        pdf.setTextColor(...(isLow ? RED : isRate ? TEAL : INK));
        const at = col.align === 'right' ? x + col.width - 3 : col.align === 'center' ? x + col.width / 2 : x + 3;
        pdf.text(this.fit(pdf, cell, available), at, y + 5.8, { align: col.align || 'left' });
        x += col.width;
      });
      pdf.setDrawColor(...BORDER);
      pdf.line(left, y + rowHeight, width - 16, y + rowHeight);
      y += rowHeight;
    });
  }

  private monthCalendar(pdf: ReportDocument, month: number, year: number, detail: DailyDetail, y: number, width: number): number {
    y = this.section(pdf, 'DAILY ATTENDANCE', y);
    const heading = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cellW = (width - 32) / 7;
    heading.forEach((h, i) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...MUTED);
      pdf.text(h, 16 + i * cellW + cellW / 2, y + 5, { align: 'center' });
    });
    y += 9;
    const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const total = new Date(year, month, 0).getDate();
    const school = new Set(detail.schoolDays);
    const absent = new Set(detail.absentDays);
    const leave = new Set(detail.approvedLeaveDays || []);
    const closed = new Set(detail.nonWorkingDays || []);
    for (let d = 1; d <= total; d++) {
      const index = offset + d - 1;
      const col = index % 7;
      const row = Math.floor(index / 7);
      const x = 16 + col * cellW;
      const top = y + row * 16;
      const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isAbsent = detail.statuses?.[key] === 'ABSENT' || absent.has(key);
      const status = school.has(key) ? (isAbsent ? (leave.has(key) ? 'L' : 'A') : 'P') : closed.has(key) ? '-' : '';
      pdf.setFillColor(...(status === 'P' ? [236, 253, 245] as [number, number, number] : status === 'A' ? [254, 242, 242] as [number, number, number] : PALE));
      pdf.roundedRect(x + 1, top, cellW - 2, 14, 1, 1, 'F');
      pdf.setTextColor(...INK);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(String(d), x + 4, top + 6);
      pdf.setFontSize(8);
      pdf.setTextColor(...(status === 'A' ? RED : status === 'P' ? TEAL : MUTED));
      pdf.text(status, x + cellW - 4, top + 10, { align: 'right' });
    }
    const rows = Math.ceil((offset + total) / 7);
    y += rows * 16 + 9;
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...MUTED);
    pdf.text('P: Present    A: Absent    L: Approved leave (counted absent)    -: Non-working day', 16, y);
    return y + 8;
  }

  private footers(pdf: ReportDocument, width: number, note?: string): void {
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      const h = pdf.internal.pageSize.getHeight();
      pdf.setDrawColor(...BORDER);
      pdf.line(16, h - 15, width - 16, h - 15);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...MUTED);
      pdf.text(note || 'System-generated attendance report | Edunexify', 16, h - 10);
      pdf.text(`Page ${i} of ${total}`, width - 16, h - 10, { align: 'right' });
    }
  }

  private percent(value: number, working: number): string {
    return working > 0 ? `${Number(value).toFixed(1)}%` : 'Not recorded';
  }

  private fit(pdf: ReportDocument, input: string, maxWidth: number): string {
    if (pdf.getTextWidth(input) <= maxWidth) return input;
    let s = input;
    while (s.length > 1 && pdf.getTextWidth(s + '...') > maxWidth) s = s.slice(0, -1);
    return s + '...';
  }

  private fileSafe(input: string): string {
    return input.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 70);
  }

  private async deliver(pdf: ReportDocument, filename: string, action: 'download' | 'share'): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      if (action === 'download') {
        pdf.save(filename);
      } else {
        const file = new File([pdf.output('blob')], filename, { type: 'application/pdf' });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          try {
            await navigator.share({ files: [file], title: 'Attendance Report' });
          } catch (error) {
            if ((error as Error)?.name !== 'AbortError') throw error;
          }
        } else {
          pdf.save(filename);
        }
      }
      return;
    }
    const data = pdf.output('datauristring').split(',')[1];
    if (!data) throw new Error('PDF encoding failed');
    if (action === 'download') {
      const saved = await nativePdfDownloads.saveToDownloads({ data, fileName: filename });
      if (!saved.uri || !saved.bytes) throw new Error('Android did not confirm the PDF download');
      return;
    }
    await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, recursive: true });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: 'Attendance Report', files: [uri], dialogTitle: 'Share attendance report' });
  }
}
