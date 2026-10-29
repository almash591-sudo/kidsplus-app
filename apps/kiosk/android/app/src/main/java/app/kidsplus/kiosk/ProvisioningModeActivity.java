package app.kidsplus.kiosk;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.PersistableBundle;

/**
 * Настройка по QR-коду (этап 53), Android 12+: система спрашивает, каким будет телефон.
 * Ответ — «полностью управляемый» (киоск — владелец устройства), как при настройке по кабелю.
 * Данные QR-кода передаём дальше — на экран ADMIN_POLICY_COMPLIANCE.
 */
public class ProvisioningModeActivity extends Activity {
    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String key = DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE;
        PersistableBundle extras = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? getIntent().getParcelableExtra(key, PersistableBundle.class)
                : getIntent().getParcelableExtra(key);
        Intent result = new Intent()
                .putExtra(
                        DevicePolicyManager.EXTRA_PROVISIONING_MODE,
                        DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE);
        if (extras != null) result.putExtra(key, extras);
        setResult(RESULT_OK, result);
        finish();
    }
}
