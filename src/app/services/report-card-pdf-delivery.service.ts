import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * How a report-card PDF reaches the user. In the Android app it is saved to the app cache and
 * handed to the system sheet (open, print, share); in a browser it is previewed or downloaded.
 * (The Web app's version of this file has no native path.)
 */
@Injectable({ providedIn: 'root' })
export class ReportCardPdfDeliveryService {
  /** True where PDFs go to the operating system (Android app) instead of an in-page preview. */
  get native(): boolean { return Capacitor.isNativePlatform(); }

  async share(blob: Blob, fileName: string): Promise<void> {
    if (!this.native) {
      this.download(blob, fileName);
      return;
    }
    const data = await this.toBase64(blob);
    await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title: 'Report Card', files: [uri], dialogTitle: 'Open, print, or share the report card' });
  }

  download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
