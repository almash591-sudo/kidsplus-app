package app.kidsplus.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.os.BatteryManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Мост для детского приложения: открыть настройки телефона (PIN), узнать состояние киоска. */
@CapacitorPlugin(name = "Kiosk")
public class KioskPlugin extends Plugin {
    private BroadcastReceiver batteryReceiver;

    /** Заряд для детского приложения (этап 8): системное «липкое» ACTION_BATTERY_CHANGED. */
    static JSObject battery(Intent i) {
        JSObject r = new JSObject();
        int level = i == null ? -1 : i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = i == null ? -1 : i.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
        int status = i == null ? -1 : i.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        r.put("level", level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : 100);
        r.put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL);
        return r;
    }

    @Override
    public void load() {
        batteryReceiver = new BroadcastReceiver() {
            private String last;

            @Override
            public void onReceive(Context c, Intent i) {
                JSObject b = battery(i);
                // Система шлёт и при смене температуры/напряжения — детскому приложению только заряд.
                String key = b.toString();
                if (key.equals(last)) return;
                last = key;
                notifyListeners("battery", b);
            }
        };
        getContext().registerReceiver(batteryReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    }

    @Override
    protected void handleOnDestroy() {
        if (batteryReceiver != null) getContext().unregisterReceiver(batteryReceiver);
    }

    @PluginMethod
    public void battery(PluginCall call) {
        call.resolve(battery(getContext().registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED))));
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        getActivity().startActivity(new Intent(getActivity(), SettingsActivity.class));
        call.resolve();
    }

    /** Альбомная только в видео (решает детское приложение); по датчику — шторки у ребёнка нет. */
    @PluginMethod
    public void setOrientation(PluginCall call) {
        boolean landscape = Boolean.TRUE.equals(call.getBoolean("landscape", false));
        getActivity().runOnUiThread(() -> getActivity().setRequestedOrientation(landscape
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR
                : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
        call.resolve();
    }

    /**
     * Яркость экрана 0…1 (этап 12в) — системная, через владельца устройства: детское приложение
     * не может менять настройки само. Автояркость выключается, иначе она перебьёт выбор ребёнка.
     */
    @PluginMethod
    public void setBrightness(PluginCall call) {
        Double level = call.getDouble("level", 0.5);
        int value = (int) Math.round(Math.max(0.02, Math.min(1.0, level == null ? 0.5 : level)) * 255);
        try {
            android.app.admin.DevicePolicyManager dpm = (android.app.admin.DevicePolicyManager)
                    getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
            android.content.ComponentName admin = AdminReceiver.component(getContext());
            dpm.setSystemSetting(admin, android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
                    String.valueOf(android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL));
            dpm.setSystemSetting(admin, android.provider.Settings.System.SCREEN_BRIGHTNESS,
                    String.valueOf(value));
            call.resolve();
        } catch (Exception e) {
            call.reject("brightness", e);
        }
    }

    /** Радионяня (этап 11): экран не гаснет (иначе нет микрофона) и почти не светит. */
    @PluginMethod
    public void setNightMode(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            android.view.Window w = getActivity().getWindow();
            android.view.WindowManager.LayoutParams p = w.getAttributes();
            if (on) {
                w.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                p.screenBrightness = 0.01f;
            } else {
                w.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                p.screenBrightness = android.view.WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            }
            w.setAttributes(p);
        });
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("deviceOwner", Policy.isOwner(getContext()));
        r.put("vpn", VpnState.status().name().toLowerCase());
        call.resolve(r);
    }
}
