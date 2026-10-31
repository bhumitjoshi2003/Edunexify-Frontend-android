package in.edunexify.app;

import android.webkit.CookieManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web layer persist the WebView cookie jar on demand.
 *
 * The session lives in HttpOnly cookies, and every token refresh rotates the refresh cookie (the
 * server retires the old value immediately). Chromium writes cookies to disk lazily, so if the
 * process is killed shortly after a rotation the app could restart holding the retired cookie and
 * be forced to log in again. The web layer calls this right after a login/refresh response.
 */
@CapacitorPlugin(name = "CookieFlush")
public class CookieFlushPlugin extends Plugin {

    @PluginMethod
    public void flush(PluginCall call) {
        CookieManager.getInstance().flush();
        call.resolve();
    }
}
