package in.edunexify.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins must be registered before super.onCreate() initialises the bridge.
        registerPlugin(CookieFlushPlugin.class);
        super.onCreate(savedInstanceState);
        // Android 15+ (targetSdk 35+) forces edge-to-edge layout by default, which pushes
        // the WebView content under the status bar regardless of the StatusBar plugin's
        // overlaysWebView setting. Opting back out here restores the system's automatic
        // status/navigation bar space reservation.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }

    // Persist session cookies whenever the app leaves the foreground. A rotated refresh cookie that
    // only lives in memory when the process is later killed would force a fresh login.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }
}
