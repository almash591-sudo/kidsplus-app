package app.kidsplus.kiosk;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class VoiceControlTest {
    @Test
    public void командыТолькоПослеСловаМалыш() {
        assertEquals("next", VoiceControl.command("малыш дальше"));
        assertEquals("louder", VoiceControl.command("Малыш громче"));
        assertEquals("songs", VoiceControl.command("малыш мультики"));
        assertEquals("mama", VoiceControl.command("малыш мама"));
        assertEquals("stop", VoiceControl.command("малыш стоп"));
        assertNull(VoiceControl.command("дальше"));
        assertNull(VoiceControl.command("малыш спит"));
        assertNull(VoiceControl.command("[unk]"));
        assertNull(VoiceControl.command(null));
    }

    @Test
    public void словарьСодержитНеизвестное() {
        String g = VoiceControl.grammar();
        assertTrue(g.contains("\"малыш дальше\""));
        assertTrue(g.contains("\"[unk]\""));
    }
}
