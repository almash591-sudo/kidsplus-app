package app.kidsplus.kiosk;

import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.util.Log;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Входящий звонок при погашенном экране (этап 10): детское приложение в WebView «спит», поэтому
 * о звонке узнаёт служба VPN — она работает всегда. Долгий запрос к серверу (до 25 с) с cookie
 * телефона из WebView; звонят — включаем экран и открываем киоск, звонок покажет детское
 * приложение. Запросы идут через VPN, как и всё на телефоне.
 */
final class CallWaiter {
    private static final String TAG = "KidsPlusCalls";
    private static Thread thread;
    private static volatile boolean running;

    private CallWaiter() {}

    static synchronized void start(Context context) {
        if (running) return;
        running = true;
        Context app = context.getApplicationContext();
        thread = new Thread(() -> loop(app), "call-waiter");
        thread.setDaemon(true);
        thread.start();
    }

    static synchronized void stop() {
        running = false;
        if (thread != null) thread.interrupt();
        thread = null;
    }

    /** Адрес детского приложения — из настроек Capacitor (server.url). */
    static String baseUrl(Context c) {
        try (InputStream in = c.getAssets().open("capacitor.config.json")) {
            return new JSONObject(read(in)).getJSONObject("server").getString("url").replaceAll("/+$", "");
        } catch (Exception e) {
            return null;
        }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0 && out.size() < 65536) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static void loop(Context c) {
        String base = baseUrl(c);
        String lastWoken = null;
        while (running && base != null) {
            long pause = 0;
            try {
                String cookie = CookieManager.getInstance().getCookie(base + "/api/kid");
                if (cookie == null || !cookie.contains("kp_device")) {
                    pause = 30_000; // телефон ещё не привязан
                } else {
                    HttpURLConnection h =
                            (HttpURLConnection) new URL(base + "/api/kid/calls/wait").openConnection();
                    h.setConnectTimeout(15_000);
                    h.setReadTimeout(40_000);
                    h.setRequestProperty("Cookie", cookie);
                    int code = h.getResponseCode();
                    if (code == 200) {
                        JSONObject r = new JSONObject(read(h.getInputStream()));
                        String callId = r.isNull("callId") ? "" : r.optString("callId", "");
                        if (!callId.isEmpty() && !callId.equals(lastWoken)) {
                            lastWoken = callId;
                            wake(c);
                        } else if (callId.isEmpty() && r.optBoolean("wake", false)) {
                            // Родитель включил радионяню — показать ночной экран.
                            wake(c);
                        }
                    } else {
                        pause = code == 401 ? 60_000 : 10_000;
                    }
                    h.disconnect();
                }
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                pause = 10_000; // нет связи или VPN ещё поднимается
            }
            if (pause > 0) {
                try {
                    Thread.sleep(pause);
                } catch (InterruptedException e) {
                    return;
                }
            }
        }
    }

    /** Включить экран и вывести киоск вперёд (владельцу устройства это разрешено из фона). */
    @SuppressWarnings("deprecation")
    private static void wake(Context c) {
        Log.i(TAG, "входящий звонок — включаю экран");
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock lock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "kidsplus:call");
        lock.acquire(15_000);
        c.startActivity(new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                .putExtra("call", true));
    }
}
