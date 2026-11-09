import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { registerPlugin } from '@capacitor/core';

interface NativeReportCardPdf {
  saveToDownloads(options: { data: string; fileName: string }): Promise<{ uri: string }>;
  renderPages(options: { uri: string }): Promise<{ pages: string[] }>;
  open(options: { uri: string; title: string }): Promise<void>;
  print(options: { uri: string; title: string }): Promise<void>;
}
const nativePdf = registerPlugin<NativeReportCardPdf>('ReportCardPdf');

/**
 * How a report-card PDF reaches the user. In the Android app it is saved to the app cache and
 * handed to the system sheet (open, print, share); in a browser it is previewed or downloaded.
 * (The Web app's version of this file has no native path.)
 */
@Injectable({ providedIn: 'root' })
export class ReportCardPdfDeliveryService {
  /** True where PDFs go to the operating system (Android app) instead of an in-page preview. */
  get native(): boolean { return Capacitor.isNativePlatform(); }

  /** The same Android PdfRenderer used by the legacy report-card preview. */
  async previewPages(blob: Blob, fileName: string): Promise<string[]> {
    const uri = await this.cache(blob, fileName);
    return (await nativePdf.renderPages({ uri })).pages;
  }

  async open(blob: Blob, fileName: string): Promise<void> {
    const uri = await this.cache(blob, fileName);
    await nativePdf.open({ uri, title: 'Report Card' });
  }

  async printNative(blob: Blob, fileName: string): Promise<void> {
    const uri = await this.cache(blob, fileName);
    await nativePdf.print({ uri, title: 'Report Card' });
  }

  /** Public Downloads/Edunexify, not the temporary sharing cache. */
  async saveToDevice(blob: Blob, fileName: string): Promise<void> {
    if (!this.native) { this.download(blob, fileName); return; }
    await nativePdf.saveToDownloads({ data: await this.toBase64(blob), fileName });
  }

  async share(blob: Blob, fileName: string): Promise<void> {
    if (!this.native) {
      this.download(blob, fileName);
      return;
    }
    const uri = await this.cache(blob, fileName);
    await Share.share({ title: 'Report Card', files: [uri], dialogTitle: 'Share report card' });
  }

  download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async cache(blob: Blob, fileName: string): Promise<string> {
    await Filesystem.writeFile({ path: fileName, data: await this.toBase64(blob), directory: Directory.Cache });
    return (await Filesystem.getUri({ path: fileName, directory: Directory.Cache })).uri;
  }

  private toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
