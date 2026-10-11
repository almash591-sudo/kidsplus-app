package app.kidsplus.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.util.Log;

/**
 * Итог тихой установки обновления. Удачная — приложение заменено, запреты вернёт BootReceiver
 * (MY_PACKAGE_REPLACED); неудачная — возвращаем запреты сразу и попробуем в следующую ночь.
 */
public class UpdateReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_SUCCESS) {
            Log.i("KidsPlusUpdate", "обновление установлено");
            return;
        }
        Log.w("KidsPlusUpdate", "обновление не установлено: " + status + " "
                + intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
        Policy.apply(context);
    }
}
