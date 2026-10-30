package app.kidsplus.kiosk;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PersistableBundle;

/**
 * Настройка по QR-коду (этап 53), Android 12+: киоск уже владелец устройства — применяем правила
 * детского режима и данные QR-кода, после чего система заканчивает первую настройку и открывает
 * киоск вместо рабочего стола.
 */
public class PolicyComplianceActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Provisioning.accept(this, extras());
        setResult(RESULT_OK);
        finish();
    }

    @SuppressWarnings("deprecation")
    private PersistableBundle extras() {
        String key = DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            return getIntent().getParcelableExtra(key, PersistableBundle.class);
        return getIntent().getParcelableExtra(key);
    }
}
