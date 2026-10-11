package app.kidsplus.kiosk.vpn;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Ссылки VLESS (Reality / TLS) и подписки. Ключ подписки хранится только на телефоне
 * и на сервер KidsPlus не уходит.
 */
public final class Vless {
    private Vless() {}

    /** Узел VPN из ссылки vless://uuid@host:port?…#имя. */
    public static final class Node {
        public String name;
        public String server;
        public int port;
        public String uuid;
        public String flow;
        /** reality | tls | none */
        public String security;
        public String sni;
        public String fingerprint;
        public String publicKey;
        public String shortId;
        public List<String> alpn = new ArrayList<>();
        /** tcp | ws | grpc | httpupgrade */
        public String transport;
        public String path;
        public String host;
        public String serviceName;
    }

    private static final Pattern UUID_RE =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private static String decode(String s) {
        try {
            return URLDecoder.decode(s.replace("+", "%2B"), StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return s;
        }
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> out = new HashMap<>();
        if (raw == null) return out;
        for (String part : raw.split("&")) {
            int eq = part.indexOf('=');
            String k = eq < 0 ? part : part.substring(0, eq);
            String v = eq < 0 ? "" : decode(part.substring(eq + 1)).trim();
            if (!k.isEmpty() && !v.isEmpty()) out.put(k, v);
        }
        return out;
    }

    /** Одна ссылка; null — не VLESS или неполная. */
    public static Node parse(String link) {
        if (link == null) return null;
        String s = link.trim();
        if (!s.toLowerCase().startsWith("vless://")) return null;
        URI uri;
        try {
            uri = new URI("http://" + s.substring("vless://".length()));
        } catch (Exception e) {
            return null;
        }
        String uuid = uri.getRawUserInfo() == null ? "" : decode(uri.getRawUserInfo());
        String server = uri.getHost();
        int port = uri.getPort();
        if (!UUID_RE.matcher(uuid).matches() || server == null || port < 1 || port > 65535) return null;
        Map<String, String> q = query(uri.getRawQuery());
        Node n = new Node();
        n.server = server.replaceAll("^\\[|\\]$", "");
        n.port = port;
        n.uuid = uuid;
        n.security = q.getOrDefault("security", "none");
        if (!Arrays.asList("reality", "tls", "none").contains(n.security)) return null;
        n.publicKey = q.get("pbk");
        if ("reality".equals(n.security) && n.publicKey == null) return null;
        String type = q.getOrDefault("type", "tcp");
        switch (type) {
            case "tcp":
            case "raw":
                n.transport = "tcp";
                break;
            case "ws":
            case "httpupgrade":
                n.transport = type;
                n.path = q.getOrDefault("path", "/");
                n.host = q.get("host");
                break;
            case "grpc":
                n.transport = "grpc";
                n.serviceName = q.getOrDefault("serviceName", "");
                break;
            default:
                return null;
        }
        n.flow = q.get("flow");
        n.sni = q.containsKey("sni") ? q.get("sni") : q.get("peer");
        n.fingerprint = q.get("fp");
        n.shortId = q.get("sid");
        if (q.containsKey("alpn"))
            for (String a : q.get("alpn").split(",")) if (!a.isEmpty()) n.alpn.add(a);
        String frag = uri.getRawFragment();
        n.name = frag == null || frag.isEmpty() ? n.server : decode(frag);
        return n;
    }

    private static List<Node> lines(String text) {
        List<Node> out = new ArrayList<>();
        for (String l : text.split("\\r?\\n")) {
            Node n = parse(l);
            if (n != null) out.add(n);
        }
        return out;
    }

    /** Текст подписки: ссылки по строкам, обычным текстом или в base64. */
    public static List<Node> parseSubscription(String text) {
        String raw = text == null ? "" : text.trim();
        List<Node> plain = lines(raw);
        if (!plain.isEmpty()) return plain;
        try {
            String b64 = raw.replaceAll("\\s+", "").replace('-', '+').replace('_', '/');
            while (b64.length() % 4 != 0) b64 += "=";
            return lines(new String(Base64.getDecoder().decode(b64), StandardCharsets.UTF_8));
        } catch (IllegalArgumentException e) {
            return new ArrayList<>();
        }
    }

    /** Адрес подписки (https://…) или null, если введены сами ссылки. */
    public static String subscriptionUrl(String input) {
        String s = input == null ? "" : input.trim();
        if (!s.matches("(?i)^https?://\\S+$")) return null;
        try {
            return new URI(s).toString();
        } catch (Exception e) {
            return null;
        }
    }
}
