package app.kidsplus.kiosk;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.VpnService;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Настройки телефона для родителя: PIN (свой, на телефоне — работает и без связи), подписка VPN,
 * Wi-Fi, выход из киоска. Без PIN и VPN киоск открывает этот экран сам (первая настройка).
 */
public class SettingsActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private Store store;
    private LinearLayout root;
    private TextView vpnStatus;
    private final Runnable onVpn = () -> main.post(this::showVpnStatus);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new Store(this);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(30, 27, 75));
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        root.setPadding(pad, pad * 2, pad, pad);
        scroll.addView(root);
        setContentView(scroll);
        if (store.hasPin()) showLock();
        else showSetPin();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Policy.lockTask(this);
        VpnState.listen(onVpn);
    }

    @Override
    protected void onPause() {
        super.onPause();
        VpnState.unlisten(onVpn);
    }

    /** Без PIN и VPN назад к ребёнку нельзя — сначала настройка. */
    @Override
    public void onBackPressed() {
        if (store.hasPin() && store.hasVpnConfig()) super.onBackPressed();
    }

    // ─── Экраны ─────────────────────────────────────────────────────────────

    private void showSetPin() {
        root.removeAllViews();
        title("Настройка телефона");
        text("Придумайте PIN для настроек этого телефона (4–6 цифр). Он нужен, чтобы ребёнок не "
                + "поменял VPN и не вышел из детского режима.");
        EditText a = pinField("PIN");
        EditText b = pinField("Ещё раз");
        TextView err = errorText();
        button("Сохранить PIN", v -> {
            String p = a.getText().toString();
            if (!p.matches("\\d{4,6}")) err.setText("PIN — от 4 до 6 цифр.");
            else if (!p.equals(b.getText().toString())) err.setText("PIN не совпадает.");
            else {
                store.setPin(p);
                showMenu();
            }
        });
    }

    private void showLock() {
        root.removeAllViews();
        title("Настройки телефона");
        EditText pin = pinField("PIN родителя");
        TextView err = errorText();
        button("Открыть", v -> {
            if (store.checkPin(pin.getText().toString())) showMenu();
            else {
                pin.setText("");
                err.setText("Неверный PIN.");
            }
        });
        if (store.hasVpnConfig()) button("Назад к ребёнку", v -> finish());
    }

    private void showMenu() {
        root.removeAllViews();
        title("Настройки телефона");
        vpnStatus = text("");
        showVpnStatus();
        text(Policy.isOwner(this)
                ? "Детский режим: телефон под управлением KidsPlus."
                : "Детский режим не включён: киоск не назначен владельцем устройства (см. инструкцию).");

        section("VPN");
        text("Ссылка vless://… или адрес подписки https://… Ключ хранится только на этом телефоне.");
        EditText input = new EditText(this);
        input.setHint("vless://… или https://…");
        input.setText(store.vpnSource());
        input.setMinLines(2);
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.GRAY);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        root.addView(input);
        button("Вставить из буфера", v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = cm.getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0)
                input.setText(clip.getItemAt(0).coerceToText(this));
        });
        TextView result = text("");
        button("Подключить", v -> connect(input.getText().toString(), result));

        section("Связь");
        // Панель Wi-Fi — системный экран: на время выбора сети снимаем блокировку задачи,
        // при возврате в киоск она включится снова.
        button("Wi-Fi", v -> {
            Policy.unlockTask(this);
            startActivity(new Intent(Settings.Panel.ACTION_WIFI));
        });
        // Сеть со страницей входа (отель, аэропорт, кафе): постоянный VPN её блокирует —
        // на 10 минут или до возврата к ребёнку снимаем блокировку.
        button("Wi-Fi со входом (отель, аэропорт)", v -> {
            store.setPortal(true);
            Policy.applyVpn(this);
            system(Settings.ACTION_WIFI_SETTINGS);
        });
        button("Bluetooth (наушники)", v -> system(Settings.ACTION_BLUETOOTH_SETTINGS));

        section("Телефон");
        // Яркость, звук и прочее; запреты детского режима (сброс, приложения, VPN) действуют.
        button("Все настройки телефона", v -> system(Settings.ACTION_SETTINGS));

        section("Детский режим");
        button("Назад к ребёнку", v -> finish());
        button("Выйти из детского режима на 30 минут", v -> {
            Policy.suspend(this);
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            startActivity(Intent.createChooser(home, "Рабочий стол"));
            finish();
        });
        button("Сменить PIN", v -> showSetPin());
        button("Вернуть телефон в обычный режим", v -> new AlertDialog.Builder(this)
                .setTitle("Вернуть обычный режим?")
                .setMessage("Киоск перестанет управлять телефоном: снимутся запреты и постоянный VPN. "
                        + "Чтобы снова включить детский режим, нужен компьютер (инструкция).")
                .setPositiveButton("Вернуть", (d, w) -> {
                    VpnState.stop(this);
                    Policy.release(this);
                    finishAffinity();
                })
                .setNegativeButton("Отмена", null)
                .show());
    }

    private void showVpnStatus() {
        if (vpnStatus == null) return;
        String s;
        switch (VpnState.status()) {
            case CONNECTED:
                s = "VPN: подключён ✅";
                break;
            case CONNECTING:
                s = "VPN: подключается…";
                break;
            case ERROR:
                s = "VPN: ошибка — " + VpnState.error();
                break;
            default:
                s = store.hasVpnConfig() ? "VPN: выключен" : "VPN: не настроен";
        }
        vpnStatus.setText(s);
    }

    // ─── Подключение VPN ────────────────────────────────────────────────────

    private void connect(String input, TextView result) {
        result.setText("Подключаю…");
        new Thread(() -> {
            String msg;
            try {
                msg = "Узлов VPN: " + VpnSetup.configure(this, input) + ". Подключаю…";
            } catch (Exception e) {
                msg = "Не получилось: " + e.getMessage();
            }
            String m = msg;
            main.post(() -> {
                result.setText(m);
                startVpn();
            });
        }).start();
    }

    private static final int VPN_CONSENT = 1;

    /**
     * Запуск VPN. Владельцу устройства разрешение даёт постоянный VPN; без него (проверка на
     * обычном телефоне) Android один раз спрашивает родителя.
     */
    private void startVpn() {
        Intent consent = VpnService.prepare(this);
        if (consent != null) startActivityForResult(consent, VPN_CONSENT);
        else VpnState.ensureRunning(this);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == VPN_CONSENT && resultCode == RESULT_OK) VpnState.ensureRunning(this);
    }

    // ─── Простые элементы ───────────────────────────────────────────────────

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void title(String s) {
        TextView t = text(s);
        t.setTextSize(26);
        t.setTypeface(Typeface.DEFAULT_BOLD);
    }

    private void section(String s) {
        TextView t = text(s);
        t.setTextSize(20);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(20), 0, 0);
    }

    private TextView text(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(Color.WHITE);
        t.setTextSize(16);
        t.setPadding(0, dp(6), 0, dp(6));
        root.addView(t);
        return t;
    }

    private TextView errorText() {
        TextView t = text("");
        t.setTextColor(Color.rgb(252, 165, 165));
        return t;
    }

    private EditText pinField(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextColor(Color.WHITE);
        e.setHintTextColor(Color.GRAY);
        e.setGravity(Gravity.CENTER);
        e.setTextSize(24);
        e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        root.addView(e);
        return e;
    }

    /** Системный экран настроек: блокировку задачи снимаем, при возврате в киоск — снова. */
    private void system(String action) {
        Policy.unlockTask(this);
        startActivity(new Intent(action));
    }

    private void button(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        root.addView(b, lp);
    }
}
