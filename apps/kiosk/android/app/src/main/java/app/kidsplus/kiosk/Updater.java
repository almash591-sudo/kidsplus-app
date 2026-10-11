package app.kidsplus.kiosk;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.BatteryManager;
import android.os.PowerManager;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import org.json.JSONObject;

/**
 * Обновление киоска без кабеля (этап 15б). Ночью, когда телефон заряжается и экран выключен,
 * спрашивает сервер о новой версии, скачивает APK, сверяет SHA-256 и ставит его сам — владельцу
 * устройства подтверждение не нужно. Запреты возвращает BootReceiver после замены приложения
 * (или UpdateReceiver, если установка не удалась).
 */
final class Updater {
    private static final String TAG = "KidsPlusUpdate";
    /** Как часто проверять условия. */
    private static final long TICK_MS = 30 * 60_000L;
    /** Не спрашивать сервер чаще. */
    private static final long CHECK_EVERY_MS = 3 * 3600_000L;
    private static Thread thread;
    private static volatile boolean running;

    private Updater() {}

    static synchronized void start(Context context) {
        if (running) return;
        running = true;
        Context app = context.getApplicationContext();
        thread = new Thread(() -> loop(app), "kiosk-updater");
        thread.setDaemon(true);
        thread.start();
    }

    static synchronized void stop() {
        running = false;
        if (thread != null) thread.interrupt();
        thread = null;
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("updater", Context.MODE_PRIVATE);
    }

    private static void loop(Context c) {
        while (running) {
            try {
                Thread.sleep(TICK_MS);
            } catch (InterruptedException e) {
                return;
            }
            try {
                long last = prefs(c).getLong("checkedAt", 0);
                if (quietTime(c) && System.currentTimeMillis() - last > CHECK_EVERY_MS) {
                    prefs(c).edit().putLong("checkedAt", System.currentTimeMillis()).apply();
                    checkAndInstall(c);
                }
            } catch (Exception e) {
                Log.w(TAG, "проверка обновления", e);
            }
        }
    }

    /** Телефон на зарядке и экран выключен — ребёнок не занимается. */
    static boolean quietTime(Context c) {
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        Intent battery = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int plugged = battery == null ? 0 : battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        return plugged != 0 && !pm.isInteractive();
    }

    static long currentVersion(Context c) throws Exception {
        return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).getLongVersionCode();
    }

    /** Есть версия новее — скачать, проверить, поставить. */
    static void checkAndInstall(Context c) throws Exception {
        String base = CallWaiter.baseUrl(c);
        if (base == null || !Policy.isOwner(c)) return;
        JSONObject r = new JSONObject(get(base + "/api/kiosk/latest"));
        if (r.isNull("release")) return;
        JSONObject rel = r.getJSONObject("release");
        long code = rel.getLong("versionCode");
        if (code <= currentVersion(c)) return;
        Log.i(TAG, "новая версия " + code + " — скачиваю");
        File apk = new File(c.getCacheDir(), "update.apk");
        download(base + rel.getString("url"), apk, rel.getLong("bytes"));
        if (!rel.getString("sha256").equalsIgnoreCase(sha256(apk))) {
            apk.delete();
            throw new IllegalStateException("APK повреждён: SHA-256 не совпадает");
        }
        install(c, apk);
    }

    private static String get(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15_000);
        h.setReadTimeout(30_000);
        try (InputStream in = h.getInputStream()) {
            if (h.getResponseCode() != 200) throw new IllegalStateException("HTTP " + h.getResponseCode());
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 65536) out.write(buf, 0, n);
            return new String(out.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
        } finally {
            h.disconnect();
        }
    }

    private static void download(String url, File to, long bytes) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15_000);
        h.setReadTimeout(60_000);
        try (InputStream in = h.getInputStream(); OutputStream out = new FileOutputStream(to)) {
            if (h.getResponseCode() != 200) throw new IllegalStateException("HTTP " + h.getResponseCode());
            byte[] buf = new byte[256 * 1024];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                total += n;
            }
            if (total != bytes) throw new IllegalStateException("скачано " + total + " из " + bytes);
        } finally {
            h.disconnect();
        }
    }

    static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    /** Тихая установка владельцем устройства; на время установки снимаем запрет установки. */
    private static void install(Context c, File apk) throws Exception {
        Policy.allowUpdate(c);
        PackageInstaller pi = c.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName());
        if (android.os.Build.VERSION.SDK_INT >= 31)
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (InputStream in = new FileInputStream(apk);
                    OutputStream out = s.openWrite("kiosk.apk", 0, apk.length())) {
                byte[] buf = new byte[256 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out);
            }
            PendingIntent done = PendingIntent.getBroadcast(c, id,
                    new Intent(c, UpdateReceiver.class),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
            Log.i(TAG, "устанавливаю");
            s.commit(done.getIntentSender());
        }
    }
}
