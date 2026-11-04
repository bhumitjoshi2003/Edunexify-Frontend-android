package in.edunexify.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class ReportCardPdfActivity extends Activity {
    public static final String EXTRA_URI = "pdf_uri";
    public static final String EXTRA_TITLE = "pdf_title";

    private LinearLayout pages;
    private TextView loading;
    private final List<Bitmap> renderedBitmaps = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String uriValue = getIntent().getStringExtra(EXTRA_URI);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        if (title == null || title.isBlank()) title = "Report Card";

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(238, 243, 247));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(12), dp(8), dp(16), dp(8));
        toolbar.setBackgroundColor(Color.rgb(15, 118, 110));

        TextView back = new TextView(this);
        back.setText("‹");
        back.setTextColor(Color.WHITE);
        back.setTextSize(34);
        back.setGravity(Gravity.CENTER);
        back.setContentDescription("Back");
        back.setOnClickListener(v -> finish());
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(44), dp(48)));

        TextView heading = new TextView(this);
        heading.setText(title);
        heading.setTextColor(Color.WHITE);
        heading.setTextSize(18);
        heading.setTypeface(null, android.graphics.Typeface.BOLD);
        heading.setSingleLine(true);
        heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, dp(48), 1f);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(heading, titleParams);

        root.addView(toolbar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        pages = new LinearLayout(this);
        pages.setOrientation(LinearLayout.VERTICAL);
        pages.setGravity(Gravity.CENTER_HORIZONTAL);
        pages.setPadding(dp(10), dp(12), dp(10), dp(20));

        loading = new TextView(this);
        loading.setText("Loading report card…");
        loading.setTextSize(15);
        loading.setTextColor(Color.rgb(71, 85, 105));
        loading.setGravity(Gravity.CENTER);
        pages.addView(loading, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(160)
        ));

        scroll.addView(pages, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
        ));
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        setContentView(root);

        if (uriValue == null || uriValue.isBlank()) {
            showError("Report card file is unavailable.");
            return;
        }
        render(Uri.parse(uriValue));
    }

    private void render(Uri uri) {
        new Thread(() -> {
            try (
                    ParcelFileDescriptor descriptor = openDescriptor(uri);
                    PdfRenderer renderer = new PdfRenderer(descriptor)
            ) {
                int targetWidth = Math.max(dp(280), getResources().getDisplayMetrics().widthPixels - dp(20));
                List<Bitmap> ready = new ArrayList<>();

                for (int i = 0; i < renderer.getPageCount(); i++) {
                    try (PdfRenderer.Page page = renderer.openPage(i)) {
                        float ratio = (float) page.getHeight() / (float) page.getWidth();
                        int targetHeight = Math.max(1, Math.round(targetWidth * ratio));
                        Bitmap bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
                        bitmap.eraseColor(Color.WHITE);
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        ready.add(bitmap);
                    }
                }

                runOnUiThread(() -> showPages(ready));
            } catch (Exception e) {
                runOnUiThread(() -> showError("Could not display this report card."));
            }
        }, "report-card-pdf-renderer").start();
    }

    private void showPages(List<Bitmap> bitmaps) {
        pages.removeAllViews();
        renderedBitmaps.addAll(bitmaps);
        for (Bitmap bitmap : bitmaps) {
            ImageView image = new ImageView(this);
            image.setImageBitmap(bitmap);
            image.setAdjustViewBounds(true);
            image.setScaleType(ImageView.ScaleType.FIT_CENTER);
            image.setBackgroundColor(Color.WHITE);
            image.setContentDescription("Report card page");

            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            params.setMargins(0, 0, 0, dp(12));
            pages.addView(image, params);
        }
        if (bitmaps.isEmpty()) showError("This report card has no pages.");
    }

    private void showError(String message) {
        pages.removeAllViews();
        TextView error = new TextView(this);
        error.setText(message);
        error.setTextColor(Color.rgb(185, 28, 28));
        error.setTextSize(15);
        error.setGravity(Gravity.CENTER);
        pages.addView(error, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(180)
        ));
    }

    private ParcelFileDescriptor openDescriptor(Uri uri) throws Exception {
        if ("file".equalsIgnoreCase(uri.getScheme())) {
            return ParcelFileDescriptor.open(new File(uri.getPath()), ParcelFileDescriptor.MODE_READ_ONLY);
        }
        ParcelFileDescriptor descriptor = getContentResolver().openFileDescriptor(uri, "r");
        if (descriptor == null) throw new IllegalStateException("Unable to open PDF");
        return descriptor;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        for (Bitmap bitmap : renderedBitmaps) {
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
        }
        renderedBitmaps.clear();
        super.onDestroy();
    }
}
