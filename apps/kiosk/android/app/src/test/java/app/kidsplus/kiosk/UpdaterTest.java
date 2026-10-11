package app.kidsplus.kiosk;

import static org.junit.Assert.assertEquals;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Test;

public class UpdaterTest {
    @Test
    public void sha256ПоФайлу() throws Exception {
        File f = File.createTempFile("apk", ".bin");
        try {
            Files.write(f.toPath(), "abc".getBytes(StandardCharsets.UTF_8));
            assertEquals(
                    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                    Updater.sha256(f));
        } finally {
            f.delete();
        }
    }
}
