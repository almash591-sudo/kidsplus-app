package app.kidsplus.kiosk;

import android.content.Context;
import app.kidsplus.kiosk.vpn.SingBox;
import app.kidsplus.kiosk.vpn.Vless;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Настройка VPN по ссылке или подписке — из «Настроек телефона» и из скрипта провижининга. */
public final class VpnSetup {
    private VpnSetup() {}

    /**
     * Скачать подписку (если это адрес), собрать настройки sing-box и сохранить.
     * Блокирующий вызов — не из главного потока. Возвращает число узлов VPN.
     */
    public static int configure(Context c, String input) throws Exception {
        return configure(c, input, null);
    }

    /**
     * @param prefetched текст подписки, уже скачанный на компьютере (провижининг): без VPN телефон
     *     часто не может открыть адрес подписки. Сам адрес сохраняется — для обновления через туннель.
     */
    public static int configure(Context c, String input, String prefetched) throws Exception {
        Store store = new Store(c);
        try {
            // На время настройки — без блокировки и без старого туннеля, чтобы скачать подписку.
            store.setConfiguring(true);
            VpnState.stop(c);
            Policy.applyVpn(c);
            String url = Vless.subscriptionUrl(input);
            String body = prefetched != null ? prefetched : url != null ? fetch(url) : input;
            List<Vless.Node> nodes = Vless.parseSubscription(body);
            if (nodes.isEmpty())
                throw new IllegalArgumentException(
                        "не нашёл ни одной ссылки VLESS — проверьте ссылку или подписку");
            store.setVpn(input.trim(), SingBox.config(nodes));
            return nodes.size();
        } finally {
            store.setConfiguring(false);
            Policy.applyVpn(c);
        }
    }

    /** Подписка: представляемся клиентом v2rayNG — так панели отдают список ссылок в base64. */
    static String fetch(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("User-Agent", "v2rayNG/1.10.0");
        if (c.getResponseCode() != 200)
            throw new IllegalStateException("подписка: HTTP " + c.getResponseCode());
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && out.size() < 2_000_000) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
