package app.kidsplus.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * После перезагрузки — снова киоск (выход по PIN не переживает перезагрузку). После обновления
 * без кабеля (MY_PACKAGE_REPLACED) — вернуть запреты, снятые на время установки.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Policy.apply(context);
            return;
        }
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)) return;
        new Store(context).setSuspended(false);
        Policy.apply(context);
    }
}
