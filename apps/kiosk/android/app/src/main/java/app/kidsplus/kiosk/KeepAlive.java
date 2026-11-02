package app.kidsplus.kiosk;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Служба без VPN (этап 53): включить, если VPN не нужен, и выключить, если снова нужен. */
final class KeepAlive {
    private KeepAlive() {}

    static void ensure(Context c) {
        if (!new Store(c).isVpnOff()) return;
        try {
            c.startForegroundService(new Intent(c, KeepAliveService.class));
        } catch (Exception e) {
            // Android 14+ не даёт такую службу не владельцу устройства (проверка на обычном телефоне).
            Log.w("KidsPlusKeepAlive", "start", e);
        }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, KeepAliveService.class));
    }
}
