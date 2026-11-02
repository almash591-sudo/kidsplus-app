package app.kidsplus.kiosk;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Киоск: детское приложение в WebView (адрес — capacitor.config.json), вместо рабочего стола,
 * в режиме блокировки задачи. Первый запуск без PIN или VPN — сразу настройки телефона.
 * После настройки по QR-коду (этап 53) детское приложение само привязывается к ребёнку.
 */
public class MainActivity extends BridgeActivity {
    /** Ждём VPN, чтобы открыть ссылку привязки, — иначе она не дойдёт до сервера. */
    private final Runnable onVpn = () -> runOnUiThread(this::openPendingPair);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KioskPlugin.class);
        super.onCreate(savedInstanceState);
        // Книжная; альбомную на время видео включает детское приложение (KioskPlugin).
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Ребёнок снова в киоске — вход в сеть закончен, VPN снова с блокировкой.
        new Store(this).setPortal(false);
        Policy.apply(this);
        Policy.lockTask(this);
        Store s = new Store(this);
        if (s.needsSetup()) {
            startActivity(new Intent(this, SettingsActivity.class));
            return;
        }
        if (s.isVpnOff()) KeepAlive.ensure(this);
        else VpnState.ensureRunning(this);
        VpnState.listen(onVpn);
        openPendingPair();
    }

    @Override
    public void onPause() {
        super.onPause();
        VpnState.unlisten(onVpn);
    }

    /** Код привязки из QR-кода настройки — один раз, когда есть связь с сервером. */
    private void openPendingPair() {
        Store s = new Store(this);
        String code = s.pendingPair();
        if (code == null || bridge == null || s.needsSetup()) return;
        if (!s.isVpnOff() && VpnState.status() != VpnState.Status.CONNECTED) return;
        String base = CallWaiter.baseUrl(this);
        if (base == null) return;
        s.setPendingPair(null);
        bridge.getWebView().loadUrl(Provisioning.pairUrl(base, code));
    }

    /** «Назад» листает историю детского приложения, но не закрывает киоск. */
    @Override
    public void onBackPressed() {
        if (bridge != null && bridge.getWebView().canGoBack()) bridge.getWebView().goBack();
    }
}
