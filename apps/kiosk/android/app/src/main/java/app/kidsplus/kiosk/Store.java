package app.kidsplus.kiosk;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * Данные киоска — только на телефоне (личное хранилище приложения): PIN настроек телефона,
 * подписка VPN и готовые настройки sing-box.
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
