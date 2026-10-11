package app.kidsplus.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** После перезагрузки — снова киоск (выход по PIN не переживает перезагрузку). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        new Store(context).setSuspended(false);
        Policy.apply(context);
    }
}
