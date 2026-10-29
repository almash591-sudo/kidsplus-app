package app.kidsplus.kiosk;

import android.content.Context;
import android.os.PersistableBundle;
import android.util.Log;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Настройка телефона без компьютера (этап 53). Сброшенный телефон сканирует QR-код из кабинета,
 * Android сам скачивает киоск и делает его владельцем устройства, а данные из QR-кода
 * (PROVISIONING_ADMIN_EXTRAS_BUNDLE) приходят сюда: код привязки, VPN или «VPN не нужен».
 * Все значения — строки: так их надёжно передаёт сканер QR-кода.
 */
public final class Provisioning {
    private static final String TAG = "KidsPlusProvision";
    /** Код привязки к ребёнку (как в «Устройствах» кабинета). */
    public static final String EXTRA_PAIR = "kidsplus.pair";
    /** Ссылки vless:// или адрес подписки — если семье нужен VPN. */
    public static final String EXTRA_VPN = "kidsplus.vpn";
    /** "1" — VPN не нужен: семья не в России. */
    public static final String EXTRA_NO_VPN = "kidsplus.noVpn";

    private static final AtomicBoolean vpnBusy = new AtomicBoolean(false);

    private Provisioning() {}

    /** Что делать после настройки — разобранные данные QR-кода. */
    static final class Plan {
        final String pairCode;
        final String vpnSource;
        final boolean noVpn;

        Plan(String pairCode, String vpnSource, boolean noVpn) {
            this.pairCode = pairCode;
            this.vpnSource = vpnSource;
            this.noVpn = noVpn;
        }
    }

    /** Разбор без Android — для тестов. Чужое или битое значение просто не учитывается. */
    static Plan parse(String pair, String vpn, String noVpn) {
        String code = pair == null ? "" : pair.trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9-]{4,24}")) code = null;
        String source = vpn == null ? "" : vpn.trim();
        if (source.isEmpty() || source.length() > 8000) source = null;
        boolean off = source == null && noVpn != null && noVpn.trim().matches("1|true");
        return new Plan(code, source, off);
    }

    /**
     * Ссылка привязки детского приложения — та же, что в QR-коде «Привязать телефон». Код уже
     * проверен parse (буквы, цифры, дефис) — кодировать нечего.
     */
    static String pairUrl(String base, String code) {
        return base.replaceAll("/+$", "") + "/pair?code=" + code;
    }

    /**
     * Применить данные QR-кода. Android зовёт и экран ADMIN_POLICY_COMPLIANCE (12+), и
     * AdminReceiver — повторный вызов ничего не портит.
     */
    static void accept(Context context, PersistableBundle extras) {
        Context app = context.getApplicationContext();
        Store store = new Store(app);
        if (extras != null) {
            Plan plan = parse(
                    extras.getString(EXTRA_PAIR),
                    extras.getString(EXTRA_VPN),
                    extras.getString(EXTRA_NO_VPN));
            if (plan.pairCode != null) store.setPendingPair(plan.pairCode);
            if (plan.noVpn) store.setVpnOff(true);
            if (plan.vpnSource != null) configureVpn(app, store, plan.vpnSource);
            Log.i(TAG, "QR: привязка " + (plan.pairCode != null) + ", VPN "
                    + (plan.vpnSource != null ? "есть" : plan.noVpn ? "не нужен" : "не задан"));
        }
        Policy.apply(app);
        KeepAlive.ensure(app);
    }

    /**
     * VPN из QR-кода — в фоне (подписку надо скачать). Не вышло — ссылка остаётся в настройках
     * телефона, родитель нажмёт «Подключить» сам.
     */
    private static void configureVpn(Context app, Store store, String source) {
        if (source.equals(store.vpnSource()) && store.hasVpnConfig()) return;
        if (!vpnBusy.compareAndSet(false, true)) return;
        store.setVpnOff(false);
        if (!store.hasVpnConfig()) store.setVpnSource(source);
        new Thread(() -> {
            try {
                Log.i(TAG, "VPN из QR: узлов " + VpnSetup.configure(app, source));
                VpnState.ensureRunning(app);
            } catch (Exception e) {
                Log.w(TAG, "VPN из QR", e);
            } finally {
                vpnBusy.set(false);
            }
        }, "qr-vpn").start();
    }
}
