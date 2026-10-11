package app.kidsplus.kiosk;

import android.app.admin.DeviceAdminReceiver;
import android.content.ComponentName;
import android.content.Context;

/** Администратор устройства: через него киоск — владелец устройства (Device Owner). */
public class AdminReceiver extends DeviceAdminReceiver {
    public static ComponentName component(Context context) {
        return new ComponentName(context.getApplicationContext(), AdminReceiver.class);
    }
}
