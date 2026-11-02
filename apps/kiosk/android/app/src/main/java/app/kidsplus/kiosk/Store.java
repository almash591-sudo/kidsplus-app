package app.kidsplus.kiosk;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * Данные киоска — только на телефоне (личное хранилище приложения): PIN настроек телефона,
 * подписка VPN и готовые настройки sing-box, режим «без VPN», код привязки из QR-кода.
 */
public final class Store {
    private final SharedPreferences p;

    public Store(Context c) {
        p = c.getApplicationContext().getSharedPreferences("kiosk", Context.MODE_PRIVATE);
    }

    private static String hash(String salt, String pin) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256")
                    .digest((salt + ":" + pin).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public boolean hasPin() {
        return p.contains("pin_hash");
    }

    public void setPin(String pin) {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        String s = android.util.Base64.encodeToString(salt, android.util.Base64.NO_WRAP);
        p.edit().putString("pin_salt", s).putString("pin_hash", hash(s, pin)).apply();
    }

    public boolean checkPin(String pin) {
        String salt = p.getString("pin_salt", "");
        return MessageDigest.isEqual(
                hash(salt, pin).getBytes(StandardCharsets.UTF_8),
                p.getString("pin_hash", "").getBytes(StandardCharsets.UTF_8));
    }

    /** Что ввёл родитель: ссылки vless:// или адрес подписки. */
    public String vpnSource() {
        return p.getString("vpn_source", "");
    }

    public String vpnConfig() {
        return p.getString("vpn_config", null);
    }

    public boolean hasVpnConfig() {
        return vpnConfig() != null;
    }

    public void setVpn(String source, String config) {
        p.edit().putString("vpn_source", source).putString("vpn_config", config).apply();
    }

    /** Адрес или ссылки VPN из QR-кода (этап 53), если подключить сразу не вышло: их видно в настройках. */
    public void setVpnSource(String source) {
        p.edit().putString("vpn_source", source).apply();
    }

    /** VPN не нужен (семья не в России, этап 53): интернет напрямую, постоянного VPN нет. */
    public boolean isVpnOff() {
        return p.getBoolean("vpn_off", false);
    }

    public void setVpnOff(boolean v) {
        p.edit().putBoolean("vpn_off", v).commit();
    }

    /** Без PIN и без VPN (если он нужен) к ребёнку нельзя — сначала настройка телефона. */
    public boolean needsSetup() {
        return !hasPin() || (!hasVpnConfig() && !isVpnOff());
    }

    /** Код привязки из QR-кода настройки: детское приложение откроет его один раз. */
    public String pendingPair() {
        return p.getString("pending_pair", null);
    }

    public void setPendingPair(String code) {
        if (code == null) p.edit().remove("pending_pair").apply();
        else p.edit().putString("pending_pair", code).apply();
    }

    /** Идёт настройка VPN — постоянный VPN без блокировки, чтобы скачать подписку. */
    public boolean isConfiguring() {
        return p.getBoolean("configuring", false);
    }

    public void setConfiguring(boolean v) {
        p.edit().putBoolean("configuring", v).commit();
    }

    /** Сколько VPN работает без блокировки, пока родитель входит в сеть отеля или аэропорта. */
    public static final long PORTAL_MS = 10 * 60 * 1000L;

    /** Идёт вход в сеть со страницей входа: без блокировки, иначе страница не откроется. */
    public boolean isPortal() {
        return System.currentTimeMillis() < p.getLong("portal_until", 0);
    }

    public void setPortal(boolean v) {
        p.edit().putLong("portal_until", v ? System.currentTimeMillis() + PORTAL_MS : 0).commit();
    }

    /** Сколько длится выход из киоска по PIN (потом и после перезагрузки — снова киоск). */
    public static final long SUSPEND_MS = 30 * 60 * 1000L;

    public boolean isSuspended() {
        return System.currentTimeMillis() < p.getLong("suspended_until", 0);
    }

    public void setSuspended(boolean v) {
        p.edit()
                .putLong("suspended_until", v ? System.currentTimeMillis() + SUSPEND_MS : 0)
                .commit();
    }
}
