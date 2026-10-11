package app.kidsplus.kiosk;

import android.content.Context;
import android.media.AudioManager;
import android.util.Log;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

/**
 * Голосовое управление экраном малыша (этап 16в) — для мамы за рулём. Распознавание офлайн
 * (Vosk, маленькая русская модель внутри APK): звук никуда не уходит. Слушаем только короткий
 * словарь после слова «Малыш»: «дальше», «громче», «тише», «песенки», «логопед», «шум», «мама»,
 * «стоп». Громкость меняется здесь же, остальное уходит детскому приложению.
 */
final class VoiceControl implements RecognitionListener {
    private static final String TAG = "KidsPlusVoice";
    private static final float RATE = 16000f;
    /** Модель в assets (scripts/fetch-vosk-model.ps1); нет её — голос выключен, киоск работает. */
    static final String MODEL_ASSET = "model-ru";

    interface Listener {
        void onCommand(String command);
    }

    /** Слова команд и что они значат. */
    private static final String[][] WORDS = {
        {"дальше", "next"}, {"следующий", "next"}, {"следующая", "next"},
        {"громче", "louder"}, {"тише", "quieter"},
        {"песенки", "songs"}, {"песни", "songs"}, {"мультики", "songs"}, {"мультик", "songs"},
        {"логопед", "speech"},
        {"шум", "noise"}, {"спать", "noise"},
        {"мама", "mama"}, {"колыбельная", "mama"},
        {"стоп", "stop"}, {"хватит", "stop"}, {"меню", "stop"},
    };

    private final Context context;
    private final Listener listener;
    private Model model;
    private SpeechService service;
    private boolean wanted;

    VoiceControl(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    /** Словарь распознавателя: «малыш <команда>» и «[unk]» для всего остального. */
    static String grammar() {
        JSONArray a = new JSONArray();
        for (String[] w : WORDS) a.put("малыш " + w[0]);
        a.put("[unk]");
        return a.toString();
    }

    /** Команда из распознанного текста; не команда — null. */
    static String command(String text) {
        String t = text == null ? "" : text.toLowerCase(Locale.ROOT).trim();
        if (!t.startsWith("малыш ")) return null;
        String rest = t.substring("малыш ".length()).trim();
        for (String[] w : WORDS) if (rest.equals(w[0])) return w[1];
        return null;
    }

    static boolean hasModel(Context c) {
        try {
            String[] files = c.getAssets().list(MODEL_ASSET);
            return files != null && files.length > 0;
        } catch (Exception e) {
            return false;
        }
    }

    synchronized void start() {
        wanted = true;
        if (service != null) return;
        if (!hasModel(context)) {
            Log.w(TAG, "модели распознавания нет в APK — голосовое управление выключено");
            return;
        }
        if (model != null) {
            listen();
            return;
        }
        StorageService.unpack(context, MODEL_ASSET, "model",
                m -> {
                    synchronized (this) {
                        model = m;
                        if (wanted) listen();
                    }
                },
                e -> Log.e(TAG, "модель не распаковалась", e));
    }

    private void listen() {
        try {
            Recognizer rec = new Recognizer(model, RATE, grammar());
            service = new SpeechService(rec, RATE);
            service.startListening(this);
            Log.i(TAG, "слушаю «Малыш, …»");
        } catch (Exception e) {
            Log.e(TAG, "не удалось включить микрофон", e);
            service = null;
        }
    }

    synchronized void stop() {
        wanted = false;
        if (service != null) {
            service.stop();
            service.shutdown();
            service = null;
        }
    }

    private void handle(String hypothesis) {
        try {
            String cmd = command(new JSONObject(hypothesis).optString("text"));
            if (cmd == null) return;
            Log.i(TAG, "команда: " + cmd);
            if (cmd.equals("louder") || cmd.equals("quieter")) volume(cmd.equals("louder"));
            listener.onCommand(cmd);
        } catch (Exception e) {
            Log.w(TAG, "разбор", e);
        }
    }

    /** Громкость медиа — на два шага, с системной шкалой на экране (маме видно). */
    private void volume(boolean up) {
        AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        int dir = up ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER;
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, AudioManager.FLAG_SHOW_UI);
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, 0);
    }

    @Override
    public void onResult(String hypothesis) {
        handle(hypothesis);
    }

    @Override
    public void onFinalResult(String hypothesis) {
        handle(hypothesis);
    }

    @Override
    public void onPartialResult(String hypothesis) {}

    @Override
    public void onError(Exception e) {
        Log.w(TAG, "ошибка распознавания — перезапуск", e);
        synchronized (this) {
            if (service != null) service.shutdown();
            service = null;
            if (wanted) listen();
        }
    }

    @Override
    public void onTimeout() {
        synchronized (this) {
            if (wanted && service != null) service.startListening(this);
        }
    }
}
