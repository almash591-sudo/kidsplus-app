package app.kidsplus.kiosk.vpn;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import org.json.JSONObject;
import org.junit.Test;

public class VlessTest {
    // Ненастоящие ключи — только формат.
    static final String UUID = "0b4e6a3c-1d2f-4a5b-9c8d-7e6f5a4b3c2d";
    static final String REALITY = "vless://" + UUID + "@vpn.example.net:443?type=tcp&security=reality"
            + "&pbk=Zx1y2W3v4U5t6S7r8Q9p0OnMlKjIhGfEdCbA_aBcDeF&fp=chrome&sni=www.microsoft.com"
            + "&sid=6ba85179e30d4fc2&flow=xtls-rprx-vision#%D0%9D%D0%B8%D0%B4%D0%B5%D1%80%D0%BB%D0%B0%D0%BD%D0%B4%D1%8B";
    static final String WS_TLS = "vless://" + UUID + "@cdn.example.org:8443?type=ws&security=tls"
            + "&sni=cdn.example.org&path=%2Fws&host=cdn.example.org&alpn=h2,http/1.1#WS";
    static final String GRPC = "vless://" + UUID + "@g.example.org:443?type=grpc&security=reality"
            + "&pbk=Zx1y2W3v4U5t6S7r8Q9p0OnMlKjIhGfEdCbA_aBcDeF&sni=a.b&serviceName=svc#g";

    @Test
    public void realityVision() {
        Vless.Node n = Vless.parse(REALITY);
        assertNotNull(n);
        assertEquals("Нидерланды", n.name);
        assertEquals("vpn.example.net", n.server);
        assertEquals(443, n.port);
        assertEquals("reality", n.security);
        assertEquals("xtls-rprx-vision", n.flow);
        assertEquals("www.microsoft.com", n.sni);
        assertEquals("6ba85179e30d4fc2", n.shortId);
        assertEquals("tcp", n.transport);
    }

    @Test
    public void wsTls() {
        Vless.Node n = Vless.parse(WS_TLS);
        assertNotNull(n);
        assertEquals("ws", n.transport);
        assertEquals("/ws", n.path);
        assertEquals(Arrays.asList("h2", "http/1.1"), n.alpn);
    }

    @Test
    public void badLinks() {
        assertNull(Vless.parse("vmess://abc"));
        assertNull(Vless.parse("vless://not-a-uuid@h:443?security=none"));
        assertNull(Vless.parse("vless://" + UUID + "@h?security=none"));
        assertNull(Vless.parse("vless://" + UUID + "@h:443?security=reality&sni=a.b"));
        assertNull(Vless.parse("vless://" + UUID + "@h:443?type=kcp"));
    }

    @Test
    public void subscription() {
        String body = Base64.getEncoder().encodeToString(
                String.join("\n", REALITY, "trojan://x@y:1", WS_TLS, "").getBytes(StandardCharsets.UTF_8));
        List<Vless.Node> nodes = Vless.parseSubscription(body);
        assertEquals(2, nodes.size());
        assertEquals(2, Vless.parseSubscription(REALITY + "\n" + WS_TLS).size());
        assertTrue(Vless.parseSubscription("мусор").isEmpty());
        assertEquals("https://sub.example.com/abc", Vless.subscriptionUrl(" https://sub.example.com/abc "));
        assertNull(Vless.subscriptionUrl(REALITY));
    }

    @Test
    public void config() throws Exception {
        String json = SingBox.config(Arrays.asList(Vless.parse(REALITY), Vless.parse(WS_TLS), Vless.parse(GRPC)));
        JSONObject c = new JSONObject(json);
        assertEquals("tun", c.getJSONArray("inbounds").getJSONObject(0).getString("type"));
        JSONObject first = c.getJSONArray("outbounds").getJSONObject(0);
        assertEquals("local", first.getString("domain_resolver"));
        assertEquals("6ba85179e30d4fc2",
                first.getJSONObject("tls").getJSONObject("reality").getString("short_id"));
        assertEquals("urltest", c.getJSONArray("outbounds").getJSONObject(3).getString("type"));
        assertEquals("proxy", c.getJSONObject("route").getString("final"));
        // Для проверки настоящим sing-box (`sing-box check -c …`), если задан путь.
        String out = System.getenv("SINGBOX_CONFIG_OUT");
        if (out != null) Files.write(Paths.get(out), json.getBytes(StandardCharsets.UTF_8));
    }
}
