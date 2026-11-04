package in.edunexify.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "ReportCardPdf")
public class ReportCardPdfPlugin extends Plugin {
    private static final String DOWNLOAD_CHANNEL_ID = "edunexify_downloads";

    @PluginMethod
    public void open(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isBlank()) {
            call.reject("Missing PDF uri");
            return;
        }
        String title = call.getString("title", "Report Card");
        getActivity().runOnUiThread(() -> {
            Intent intent = new Intent(getActivity(), ReportCardPdfActivity.class);
            intent.putExtra(ReportCardPdfActivity.EXTRA_URI, uriValue);
            intent.putExtra(ReportCardPdfActivity.EXTRA_TITLE, title);
            getActivity().startActivity(intent);
            call.resolve();
        });
    }

    @PluginMethod
    public void print(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isBlank()) {
            call.reject("Missing PDF uri");
            return;
        }
        String title = call.getString("title", "Report Card");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                manager.print(title, new PdfFilePrintAdapter(getContext(), Uri.parse(uriValue), title), null);
                call.resolve();
            } catch (Exception e) {
                call.reject("Unable to open Android print dialog", e);
            }
        });
    }

    @PluginMethod
    public void notifyDownload(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue == null || uriValue.isBlank()) {
            call.reject("Missing PDF uri");
            return;
        }
        String title = call.getString("title", "Report card downloaded");
        String fileName = call.getString("fileName", "ReportCard.pdf");

        Context context = getContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    DOWNLOAD_CHANNEL_ID,
                    "Downloads",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Completed Edunexify downloads");
            manager.createNotificationChannel(channel);
        }

        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            result.put("shown", false);
            call.resolve(result);
            return;
        }

        Intent openIntent = new Intent(context, ReportCardPdfActivity.class);
        openIntent.putExtra(ReportCardPdfActivity.EXTRA_URI, uriValue);
        openIntent.putExtra(ReportCardPdfActivity.EXTRA_TITLE, "Report Card");
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int requestCode = Math.abs(uriValue.hashCode());
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                requestCode,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, DOWNLOAD_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(fileName + " • Tap to open")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        manager.notify(requestCode, notification.build());
        result.put("shown", true);
        call.resolve(result);
    }

    private static final class PdfFilePrintAdapter extends PrintDocumentAdapter {
        private final Context context;
        private final Uri uri;
        private final String title;

        private PdfFilePrintAdapter(Context context, Uri uri, String title) {
            this.context = context;
            this.uri = uri;
            this.title = title;
        }

        @Override
        public void onLayout(
                PrintAttributes oldAttributes,
                PrintAttributes newAttributes,
                CancellationSignal cancellationSignal,
                LayoutResultCallback callback,
                android.os.Bundle extras
        ) {
            if (cancellationSignal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }
            PrintDocumentInfo info = new PrintDocumentInfo.Builder(title)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                    .build();
            callback.onLayoutFinished(info, !newAttributes.equals(oldAttributes));
        }

        @Override
        public void onWrite(
                PageRange[] pages,
                ParcelFileDescriptor destination,
                CancellationSignal cancellationSignal,
                WriteResultCallback callback
        ) {
            try (
                    ParcelFileDescriptor source = openDescriptor(context, uri);
                    InputStream input = new FileInputStream(source.getFileDescriptor());
                    OutputStream output = new FileOutputStream(destination.getFileDescriptor())
            ) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (cancellationSignal.isCanceled()) {
                        callback.onWriteCancelled();
                        return;
                    }
                    output.write(buffer, 0, count);
                }
                output.flush();
                callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
            } catch (Exception e) {
                callback.onWriteFailed(e.getMessage());
            }
        }

        private static ParcelFileDescriptor openDescriptor(Context context, Uri uri) throws Exception {
            if ("file".equalsIgnoreCase(uri.getScheme())) {
                return ParcelFileDescriptor.open(new File(uri.getPath()), ParcelFileDescriptor.MODE_READ_ONLY);
            }
            ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(uri, "r");
            if (descriptor == null) throw new IllegalStateException("Unable to open PDF");
            return descriptor;
        }
    }
}
