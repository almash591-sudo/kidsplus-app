package app.kidsplus.kiosk;

import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import java.util.concurrent.CopyOnWriteArrayList;

/** Состояние VPN киоска — для экрана настроек и меню родителя. */
public final class VpnState {
    public enum Status {
        OFF,
        CONNECTING,
        CONNECTED,
        ERROR
    }

    private static volatile Status status = Status.OFF;
    private static volatile String error = null;
    private static final CopyOnWriteArrayList<Runnable> listeners = new CopyOnWriteArrayList<>();

    private VpnState() {}

    public static Status status() {
        return status;
    }

    public static String error() {
        return error;
    }

    static void set(Status s, String err) {
        status = s;
        error = err;
        for (Runnable l : listeners) l.run();
    }

    public static void listen(Runnable l) {
        listeners.add(l);
    }

    public static void unlisten(Runnable l) {
        listeners.remove(l);
    }

    /** Запустить VPN, если он настроен и не работает (разрешение VPN у владельца устройства — само). */
    public static void ensureRunning(Context c) {
        if (!new Store(c).hasVpnConfig()) return;
        if (status == Status.CONNECTED || status == Status.CONNECTING) return;
        if (VpnService.prepare(c) != null) {
            set(Status.ERROR, "нет разрешения на VPN");
            return;
        }
        Intent i = new Intent(c, KioskVpnService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i);
        else c.startService(i);
    }

    /**
     * Остановить VPN. Система держит VPN-сервис привязанным, поэтому stopService его не закрывает —
     * сервис закрывает туннель сам по команде STOP.
     */
    public static void stop(Context c) {
        if (status == Status.OFF) return;
        c.startService(new Intent(c, KioskVpnService.class).setAction(KioskVpnService.ACTION_STOP));
        for (int i = 0; i < 50 && status != Status.OFF; i++) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                return;
            }
        }
    }
}
