package app.kidsplus.kiosk;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * Киоск: детское приложение в WebView (адрес — capacitor.config.json), вместо рабочего стола,
 * в режиме блокировки задачи. Первый запуск без PIN или VPN — сразу настройки телефона.
 */
public class MainActivity extends BridgeActivity {
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
        if (!s.hasPin() || !s.hasVpnConfig())
            startActivity(new Intent(this, SettingsActivity.class));
        else VpnState.ensureRunning(this);
    }

    /** «Назад» листает историю детского приложения, но не закрывает киоск. */
    @Override
    public void onBackPressed() {
        if (bridge != null && bridge.getWebView().canGoBack()) bridge.getWebView().goBack();
    }
}
