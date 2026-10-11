package app.kidsplus.kiosk;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.UserManager;
import android.util.Log;

/**
 * Правила киоска (этап 6 ТЗ, п. 8): режим блокировки задачи, киоск вместо рабочего стола,
 * запреты (сброс, установка приложений, смена VPN…), постоянный VPN с блокировкой.
 * Работает, только если киоск — владелец устройства.
 */
public final class Policy {
    private static final String TAG = "KidsPlusPolicy";

    private Policy() {}

    /** Запреты для ребёнка. Отладка по USB не запрещается — через неё обновляется киоск. */
    static final String[] MEDIA_PERMISSIONS = {
        android.Manifest.permission.CAMERA, android.Manifest.permission.RECORD_AUDIO,
    };

    static final String[] RESTRICTIONS = {
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_ADD_USER,
        UserManager.DISALLOW_INSTALL_APPS,
        UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
        UserManager.DISALLOW_UNINSTALL_APPS,
        UserManager.DISALLOW_CONFIG_VPN,
        UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA,
        UserManager.DISALLOW_USB_FILE_TRANSFER,
        UserManager.DISALLOW_CONFIG_DATE_TIME,
    };

    static DevicePolicyManager dpm(Context c) {
        return (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
    }

    public static boolean isOwner(Context c) {
        return dpm(c).isDeviceOwnerApp(c.getPackageName());
    }

    /** Применить правила (идемпотентно — вызывается при каждом показе киоска). */
    public static void apply(Context c) {
        if (!isOwner(c) || new Store(c).isSuspended()) return;
        DevicePolicyManager dpm = dpm(c);
        ComponentName admin = AdminReceiver.component(c);
        try {
            dpm.setLockTaskPackages(admin, new String[] {c.getPackageName()});
            // Только меню питания: выключить телефон можно, выйти из приложения — нет.
            dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS);
            IntentFilter home = new IntentFilter(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            home.addCategory(Intent.CATEGORY_DEFAULT);
            dpm.addPersistentPreferredActivity(admin, home, new ComponentName(c, MainActivity.class));
            dpm.setStatusBarDisabled(admin, true);
            dpm.setKeyguardDisabled(admin, true);
            for (String r : RESTRICTIONS) dpm.addUserRestriction(admin, r);
            // Камера и микрофон для детского приложения — без системного вопроса ребёнку.
            for (String p : MEDIA_PERMISSIONS)
                dpm.setPermissionGrantState(admin, c.getPackageName(), p,
                        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
            applyVpn(c);
        } catch (SecurityException e) {
            Log.w(TAG, "policy", e);
        }
    }

    /**
     * Постоянный VPN — сам киоск. С блокировкой (без VPN интернета нет) — только когда VPN
     * настроен и не идёт настройка: иначе ссылку подписки не скачать. И не во время входа в сеть
     * отеля (страница входа открывается мимо VPN).
     */
    public static void applyVpn(Context c) {
        if (!isOwner(c)) return;
        Store s = new Store(c);
        boolean lockdown = s.hasVpnConfig() && !s.isConfiguring() && !s.isPortal();
        try {
            dpm(c).setAlwaysOnVpnPackage(AdminReceiver.component(c), c.getPackageName(), lockdown);
        } catch (Exception e) {
            Log.w(TAG, "always-on vpn", e);
        }
    }

    /** Режим блокировки задачи — если киоск не приостановлен родителем. */
    public static void lockTask(Activity a) {
        if (!isOwner(a) || new Store(a).isSuspended()) return;
        ActivityManager am = (ActivityManager) a.getSystemService(Context.ACTIVITY_SERVICE);
        if (am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
            try {
                a.startLockTask();
            } catch (IllegalStateException e) {
                Log.w(TAG, "lock task", e);
            }
        }
    }

    /** Снять блокировку задачи на время системного экрана (Wi-Fi); при возврате — снова киоск. */
    public static void unlockTask(Activity a) {
        try {
            a.stopLockTask();
        } catch (Exception ignored) {
            // не в режиме блокировки
        }
    }

    /** Выход из киоска на 30 минут (родитель по PIN): обычный рабочий стол и шторка. */
    public static void suspend(Activity a) {
        new Store(a).setSuspended(true);
        if (isOwner(a)) {
            DevicePolicyManager dpm = dpm(a);
            ComponentName admin = AdminReceiver.component(a);
            dpm.clearPackagePersistentPreferredActivities(admin, a.getPackageName());
            dpm.setStatusBarDisabled(admin, false);
            // Запреты тоже снимаем (в т.ч. установку — обновить киоск); вернутся с киоском.
            for (String r : RESTRICTIONS) dpm.clearUserRestriction(admin, r);
        }
        try {
            a.stopLockTask();
        } catch (Exception ignored) {
            // не в режиме блокировки
        }
        // Через 30 минут киоск откроется сам (владельцу устройства можно открывать экран из фона).
        AlarmManager alarms = (AlarmManager) a.getSystemService(Context.ALARM_SERVICE);
        PendingIntent back = PendingIntent.getActivity(
                a,
                1,
                new Intent(a, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + Store.SUSPEND_MS + 1000, back);
    }

    /**
     * Обновление киоска с компьютера (adb): запрет установки мешает и `adb install`. Снимаем его
     * до следующего показа киоска — скрипт после установки открывает киоск, и запрет вернётся.
     */
    public static void allowUpdate(Context c) {
        if (!isOwner(c)) return;
        dpm(c).clearUserRestriction(AdminReceiver.component(c), UserManager.DISALLOW_INSTALL_APPS);
    }

    /** Вернуть телефон в обычный режим: снять все запреты и перестать быть владельцем. */
    public static void release(Activity a) {
        if (!isOwner(a)) return;
        DevicePolicyManager dpm = dpm(a);
        ComponentName admin = AdminReceiver.component(a);
        try {
            a.stopLockTask();
        } catch (Exception ignored) {
            // не в режиме блокировки
        }
        for (String r : RESTRICTIONS) dpm.clearUserRestriction(admin, r);
        dpm.clearPackagePersistentPreferredActivities(admin, a.getPackageName());
        dpm.setStatusBarDisabled(admin, false);
        dpm.setKeyguardDisabled(admin, false);
        try {
            dpm.setAlwaysOnVpnPackage(admin, null, false);
        } catch (Exception ignored) {
            // нечего снимать
        }
        dpm.setLockTaskPackages(admin, new String[0]);
        dpm.clearDeviceOwnerApp(a.getPackageName());
    }
}
