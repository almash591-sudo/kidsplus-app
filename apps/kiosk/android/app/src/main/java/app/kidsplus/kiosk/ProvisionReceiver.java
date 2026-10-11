package app.kidsplus.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Подписка VPN из скрипта провижининга (adb). Защищён разрешением WRITE_SECURE_SETTINGS — оно
 * есть у adb shell, но не у приложений на телефоне: ребёнок эту команду не пошлёт.
 *
 *   adb shell am broadcast -n app.kidsplus.kiosk/.ProvisionReceiver -a app.kidsplus.kiosk.SET_VPN --es source <ссылка>
 *       [--es body <текст подписки, скачанный на компьютере>]
 *   adb shell am broadcast -n app.kidsplus.kiosk/.ProvisionReceiver -a app.kidsplus.kiosk.ALLOW_UPDATE
 *   adb shell am broadcast -n app.kidsplus.kiosk/.ProvisionReceiver -a app.kidsplus.kiosk.APPLY
 */
public class ProvisionReceiver extends BroadcastReceiver {
    public static final String ACTION = "app.kidsplus.kiosk.SET_VPN";
    /** Разрешить `adb install -r` новой версии киоска (scripts/provision-device.ps1). */
    public static final String ALLOW_UPDATE = "app.kidsplus.kiosk.ALLOW_UPDATE";
    /** Вернуть все правила детского режима (после обновления, даже неудачного). */
    public static final String APPLY = "app.kidsplus.kiosk.APPLY";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (APPLY.equals(intent.getAction())) {
            Policy.apply(context);
            setResultCode(1);
            return;
        }
        if (ALLOW_UPDATE.equals(intent.getAction())) {
            Policy.allowUpdate(context);
            setResultCode(1);
            return;
        }
        if (!ACTION.equals(intent.getAction())) return;
        String source = intent.getStringExtra("source");
        if (source == null || source.trim().isEmpty()) return;
        PendingResult result = goAsync();
        Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                int nodes = VpnSetup.configure(app, source, intent.getStringExtra("body"));
                Log.i("KidsPlusProvision", "VPN: узлов " + nodes);
                VpnState.ensureRunning(app);
                result.setResultCode(nodes);
            } catch (Exception e) {
                Log.w("KidsPlusProvision", "VPN", e);
                result.setResultCode(-1);
                result.setResultData(e.getMessage());
            } finally {
                result.finish();
            }
        }).start();
    }
}
