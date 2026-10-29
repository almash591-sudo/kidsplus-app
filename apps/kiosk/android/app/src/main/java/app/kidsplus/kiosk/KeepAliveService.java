package app.kidsplus.kiosk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Телефон без VPN (этап 53): звонки при погашенном экране и ночные обновления киоска держит эта
 * служба — с VPN их держит служба VPN (KioskVpnService).
 */
public class KeepAliveService extends Service {
    private static final String CHANNEL = "keepalive";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!new Store(this).isVpnOff()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startForegroundNotice();
        CallWaiter.start(this);
        Updater.start(this);
        return START_STICKY;
    }

    /** Включили VPN — звонки и обновления не останавливаем: их сразу подхватывает служба VPN. */
    @Override
    public void onDestroy() {
        if (new Store(this).isVpnOff()) {
            CallWaiter.stop();
            Updater.stop();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startForegroundNotice() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(
                new NotificationChannel(CHANNEL, "KidsPlus", NotificationManager.IMPORTANCE_MIN));
        PendingIntent open = PendingIntent.getActivity(
                this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle("KidsPlus")
                .setContentText("Детский режим включён")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
            startForeground(2, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
        else startForeground(2, n);
    }
}
