package app.kidsplus.kiosk.vpn;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Настройки sing-box (формат 1.12+, проверено sing-box 1.14 `check`): весь трафик телефона —
 * через VPN; несколько узлов — sing-box сам выбирает работающий (urltest); локальная сеть — напрямую.
 */
public final class SingBox {
    private SingBox() {}

    static JSONObject outbound(Vless.Node n, String tag) throws JSONException {
        JSONObject o = new JSONObject()
                .put("type", "vless")
                .put("tag", tag)
                .put("server", n.server)
                .put("server_port", n.port)
                .put("uuid", n.uuid)
                // Адрес VPN-сервера определяем без туннеля, иначе туннель не поднимется.
                .put("domain_resolver", "local");
        if (n.flow != null) o.put("flow", n.flow);
        if (!"none".equals(n.security)) {
            JSONObject tls = new JSONObject()
                    .put("enabled", true)
                    .put("server_name", n.sni != null ? n.sni : n.server)
                    .put("utls", new JSONObject()
                            .put("enabled", true)
                            .put("fingerprint", n.fingerprint != null ? n.fingerprint : "chrome"));
            if (!n.alpn.isEmpty()) tls.put("alpn", new JSONArray(n.alpn));
            if ("reality".equals(n.security))
                tls.put("reality", new JSONObject()
                        .put("enabled", true)
                        .put("public_key", n.publicKey)
                        .put("short_id", n.shortId != null ? n.shortId : ""));
            o.put("tls", tls);
        }
        switch (n.transport) {
            case "ws": {
                JSONObject t = new JSONObject().put("type", "ws").put("path", n.path);
                if (n.host != null) t.put("headers", new JSONObject().put("Host", n.host));
                o.put("transport", t);
                break;
            }
            case "httpupgrade": {
                JSONObject t = new JSONObject().put("type", "httpupgrade").put("path", n.path);
                if (n.host != null) t.put("host", n.host);
                o.put("transport", t);
                break;
            }
            case "grpc":
                o.put("transport", new JSONObject().put("type", "grpc").put("service_name", n.serviceName));
                break;
            default:
                break;
        }
        return o;
    }

    public static String config(List<Vless.Node> nodes) throws JSONException {
        if (nodes.isEmpty()) throw new IllegalArgumentException("нет узлов VPN");
        JSONArray tags = new JSONArray();
        JSONArray outbounds = new JSONArray();
        for (int i = 0; i < nodes.size(); i++) {
            String tag = "node-" + i;
            tags.put(tag);
            outbounds.put(outbound(nodes.get(i), tag));
        }
        outbounds.put(nodes.size() > 1
                ? new JSONObject()
                        .put("type", "urltest")
                        .put("tag", "proxy")
                        .put("outbounds", tags)
                        .put("url", "https://www.gstatic.com/generate_204")
                        .put("interval", "3m")
                : new JSONObject().put("type", "selector").put("tag", "proxy").put("outbounds", tags));
        outbounds.put(new JSONObject().put("type", "direct").put("tag", "direct"));

        JSONObject dns = new JSONObject()
                .put("servers", new JSONArray()
                        .put(new JSONObject()
                                .put("type", "https")
                                .put("tag", "remote")
                                .put("server", "1.1.1.1")
                                .put("detour", "proxy"))
                        .put(new JSONObject().put("type", "local").put("tag", "local")))
                .put("final", "remote")
                .put("strategy", "ipv4_only");
        JSONObject tun = new JSONObject()
                .put("type", "tun")
                .put("tag", "tun-in")
                .put("address", new JSONArray().put("172.19.0.1/30"))
                .put("mtu", 9000)
                .put("auto_route", true)
                .put("strict_route", true)
                .put("stack", "mixed");
        JSONObject route = new JSONObject()
                .put("rules", new JSONArray()
                        .put(new JSONObject().put("action", "sniff"))
                        .put(new JSONObject().put("protocol", "dns").put("action", "hijack-dns"))
                        .put(new JSONObject().put("ip_is_private", true).put("outbound", "direct")))
                .put("final", "proxy")
                .put("auto_detect_interface", true)
                .put("default_domain_resolver", "local");
        return new JSONObject()
                .put("log", new JSONObject().put("level", "warn"))
                .put("dns", dns)
                .put("inbounds", new JSONArray().put(tun))
                .put("outbounds", outbounds)
                .put("route", route)
                .toString(2);
    }
}
