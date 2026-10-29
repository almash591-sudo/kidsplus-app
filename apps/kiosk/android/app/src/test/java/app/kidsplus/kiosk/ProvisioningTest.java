package app.kidsplus.kiosk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ProvisioningTest {
    @Test
    public void кодПривязкиИзQr() {
        Provisioning.Plan p = Provisioning.parse(" ab12-cd34 ", null, null);
        assertEquals("AB12-CD34", p.pairCode);
        assertNull(p.vpnSource);
        assertFalse(p.noVpn);
    }

    @Test
    public void битыйКодНеУчитывается() {
        assertNull(Provisioning.parse("<script>", null, null).pairCode);
        assertNull(Provisioning.parse("AB", null, null).pairCode);
        assertNull(Provisioning.parse("", null, null).pairCode);
        assertNull(Provisioning.parse("AB12 CD34", null, null).pairCode);
    }

    @Test
    public void vpnИзQr() {
        Provisioning.Plan p = Provisioning.parse(null, "  https://example.test/sub  ", "1");
        assertEquals("https://example.test/sub", p.vpnSource);
        // Есть VPN — «не нужен» не действует.
        assertFalse(p.noVpn);
        StringBuilder huge = new StringBuilder();
        while (huge.length() <= 8000) huge.append("vless://x");
        assertNull(Provisioning.parse(null, huge.toString(), null).vpnSource);
        assertNull(Provisioning.parse(null, "   ", null).vpnSource);
    }

    @Test
    public void безVpn() {
        assertTrue(Provisioning.parse(null, null, "1").noVpn);
        assertTrue(Provisioning.parse(null, "", "true").noVpn);
        assertFalse(Provisioning.parse(null, null, "0").noVpn);
        assertFalse(Provisioning.parse(null, null, null).noVpn);
    }

    @Test
    public void ссылкаПривязки() {
        assertEquals(
                "https://kid.example.test/pair?code=AB12-CD34",
                Provisioning.pairUrl("https://kid.example.test/", "AB12-CD34"));
        assertEquals(
                "https://kid.example.test/pair?code=AB12",
                Provisioning.pairUrl("https://kid.example.test", "AB12"));
    }
}
