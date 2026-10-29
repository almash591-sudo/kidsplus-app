package app.kidsplus.kiosk;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.PersistableBundle;

/** Администратор устройства: через него киоск — владелец устройства (Device Owner). */
public class AdminReceiver extends DeviceAdminReceiver {
    public static ComponentName component(Context context) {
        return new ComponentName(context.getApplicationContext(), AdminReceiver.class);
    }

    /**
     * Настройка по QR-коду закончена (этап 53). На Android 12+ то же самое уже сделал
     * PolicyComplianceActivity — повтор безвреден; на старых Android — только здесь.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onProfileProvisioningComplete(Context context, Intent intent) {
        String key = DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE;
        PersistableBundle extras = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? intent.getParcelableExtra(key, PersistableBundle.class)
                : intent.getParcelableExtra(key);
        Provisioning.accept(context, extras);
    }
}
