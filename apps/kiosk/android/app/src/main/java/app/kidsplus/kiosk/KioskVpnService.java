package app.kidsplus.kiosk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.IpPrefix;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import app.kidsplus.kiosk.vpn.Net;
import app.kidsplus.kiosk.vpn.SingBox;
import app.kidsplus.kiosk.vpn.Vless;
import io.nekohasekai.libbox.BridgeOptions;
import io.nekohasekai.libbox.BridgeSession;
import io.nekohasekai.libbox.CommandServer;
import io.nekohasekai.libbox.CommandServerHandler;
import io.nekohasekai.libbox.ConnectionOwner;
import io.nekohasekai.libbox.InterfaceUpdateListener;
import io.nekohasekai.libbox.Libbox;
import io.nekohasekai.libbox.LocalDNSTransport;
import io.nekohasekai.libbox.NeighborUpdateListener;
import io.nekohasekai.libbox.NetworkInterfaceIterator;
import io.nekohasekai.libbox.OverrideOptions;
import io.nekohasekai.libbox.PlatformInterface;
import io.nekohasekai.libbox.PlatformUser;
import io.nekohasekai.libbox.RoutePrefix;
import io.nekohasekai.libbox.RoutePrefixIterator;
import io.nekohasekai.libbox.SetupOptions;
import io.nekohasekai.libbox.ShellSession;
import io.nekohasekai.libbox.StringIterator;
import io.nekohasekai.libbox.SystemProxyStatus;
import io.nekohasekai.libbox.TunOptions;
import io.nekohasekai.libbox.WIFIState;
import java.io.File;
import java.net.InetAddress;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * VPN киоска на sing-box (libbox): весь трафик телефона — через узлы VLESS из подписки родителя.
 * Постоянный VPN с блокировкой включает владелец устройства (Policy.applyVpn) — система сама
 * запускает этот сервис после перезагрузки. Подписка по адресу обновляется раз в сутки через VPN.
 */
public class KioskVpnService extends VpnService implements PlatformInterface, CommandServerHandler {
    private static final String TAG = "KidsPlusVpn";
    private static final String CHANNEL = "vpn";
    public static final String ACTION_STOP = "app.kidsplus.kiosk.STOP_VPN";
    private static boolean setupDone = false;

    private CommandServer server;
    private ParcelFileDescriptor tun;
    private Net net;
    private ScheduledExecutorService timer;

    /** Идёт запуск (sing-box поднимается в отдельном потоке). */
    private volatile boolean starting;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            shutdown();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        startForegroundNotice();
        // При загрузке VPN запускают и система (постоянный VPN), и киоск — второй запуск
        // занял бы канал sing-box и при ошибке остановил бы работающий VPN.
        if (server != null || starting) return START_STICKY;
        String config = new Store(this).vpnConfig();
        if (config == null) {
            VpnState.set(VpnState.Status.OFF, null);
            stopSelf();
            return START_NOT_STICKY;
        }
        VpnState.set(VpnState.Status.CONNECTING, null);
        net = new Net(this);
        starting = true;
        new Thread(() -> {
            try {
                start(config);
            } finally {
                starting = false;
            }
        }).start();
        return START_STICKY;
    }

    private void start(String config) {
        try {
            if (!setupDone) {
                SetupOptions o = new SetupOptions();
                File base = getFilesDir();
                File work = new File(base, "sing-box");
                File temp = new File(getCacheDir(), "sing-box");
                work.mkdirs();
                temp.mkdirs();
                o.setBasePath(base.getPath());
                o.setWorkingPath(work.getPath());
                o.setTempPath(temp.getPath());
                o.setFixAndroidStack(true);
                o.setLogMaxLines(300);
                Libbox.setup(o);
                setupDone = true;
            }
            server = new CommandServer(this, this);
            server.start();
            server.startOrReloadService(withLog(config), new OverrideOptions());
            VpnState.set(VpnState.Status.CONNECTED, null);
            scheduleRefresh();
            // Входящие звонки при погашенном экране (этап 10).
            CallWaiter.start(this);
            Updater.start(this);
        } catch (Exception e) {
            Log.e(TAG, "start", e);
            VpnState.set(VpnState.Status.ERROR, e.getMessage());
            stopSelf();
        }
    }

    /** Журнал sing-box — файл в личной папке приложения (для разбора проблем по USB). */
    private String withLog(String config) {
        try {
            File log = new File(getFilesDir(), "sing-box.log");
            log.delete();
            org.json.JSONObject c = new org.json.JSONObject(config);
            c.put("log", new org.json.JSONObject()
                    .put("level", "info")
                    .put("timestamp", true)
                    .put("output", log.getPath()));
            return c.toString();
        } catch (Exception e) {
            return config;
        }
    }

    /** Подписка по адресу: раз в сутки скачиваем заново (через VPN) и перезапускаем, если изменилась. */
    private void scheduleRefresh() {
        String url = Vless.subscriptionUrl(new Store(this).vpnSource());
        if (url == null) return;
        timer = Executors.newSingleThreadScheduledExecutor();
        timer.scheduleWithFixedDelay(() -> {
            try {
                List<Vless.Node> nodes = Vless.parseSubscription(VpnSetup.fetch(url));
                if (nodes.isEmpty()) return;
                String config = SingBox.config(nodes);
                Store s = new Store(this);
                if (config.equals(s.vpnConfig())) return;
                s.setVpn(s.vpnSource(), config);
                server.startOrReloadService(withLog(config), new OverrideOptions());
            } catch (Exception e) {
                Log.w(TAG, "refresh subscription", e);
            }
        }, 24, 24, TimeUnit.HOURS);
    }

    private void startForegroundNotice() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(
                new NotificationChannel(CHANNEL, "VPN", NotificationManager.IMPORTANCE_MIN));
        PendingIntent open = PendingIntent.getActivity(
                this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle("KidsPlus")
                .setContentText("Защищённое соединение включено")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED);
        else startForeground(1, n);
    }

    private void shutdown() {
        CallWaiter.stop();
        Updater.stop();
        if (timer != null) timer.shutdownNow();
        try {
            if (server != null) {
                server.closeService();
                server.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "close", e);
        }
        server = null;
        if (net != null) net.stop();
        try {
            if (tun != null) tun.close();
        } catch (Exception ignored) {
            // уже закрыт
        }
        tun = null;
        VpnState.set(VpnState.Status.OFF, null);
    }

    @Override
    public void onDestroy() {
        shutdown();
        super.onDestroy();
    }

    @Override
    public void onRevoke() {
        shutdown();
        stopSelf();
    }

    // ─── PlatformInterface ──────────────────────────────────────────────────

    private static void addRoutes(RoutePrefixIterator it, Builder b, boolean exclude) {
        while (it.hasNext()) {
            RoutePrefix p = it.next();
            try {
                IpPrefix prefix = new IpPrefix(InetAddress.getByName(p.address()), p.prefix());
                if (exclude) b.excludeRoute(prefix);
                else b.addRoute(prefix);
            } catch (Exception e) {
                Log.w(TAG, "route " + p.address(), e);
            }
        }
    }

    @Override
    public int openTun(TunOptions options) throws Exception {
        Builder b = new Builder().setSession("KidsPlus").setMtu(options.getMTU()).setMetered(false);
        RoutePrefixIterator a4 = options.getInet4Address();
        boolean has4 = a4.hasNext();
        while (a4.hasNext()) {
            RoutePrefix p = a4.next();
            b.addAddress(p.address(), p.prefix());
        }
        RoutePrefixIterator a6 = options.getInet6Address();
        boolean has6 = a6.hasNext();
        while (a6.hasNext()) {
            RoutePrefix p = a6.next();
            b.addAddress(p.address(), p.prefix());
        }
        if (options.getAutoRoute()) {
            if (!Libbox.DNSModeDisabled.equals(options.getDNSMode().getValue())) {
                StringIterator dns = options.getDNSServerAddress();
                while (dns.hasNext()) b.addDnsServer(dns.next());
            }
            RoutePrefixIterator r4 = options.getInet4RouteAddress();
            if (r4.hasNext()) addRoutes(r4, b, false);
            else if (has4) b.addRoute("0.0.0.0", 0);
            RoutePrefixIterator r6 = options.getInet6RouteAddress();
            if (r6.hasNext()) addRoutes(r6, b, false);
            else if (has6) b.addRoute("::", 0);
            addRoutes(options.getInet4RouteExcludeAddress(), b, true);
            addRoutes(options.getInet6RouteExcludeAddress(), b, true);
        }
        tun = b.establish();
        if (tun == null) throw new IllegalStateException("VPN не разрешён");
        return tun.getFd();
    }

    @Override
    public boolean usePlatformAutoDetectInterfaceControl() {
        return true;
    }

    /** Сокеты к VPN-серверу — мимо туннеля. */
    @Override
    public void autoDetectInterfaceControl(int fd) {
        protect(fd);
    }

    @Override
    public boolean useProcFS() {
        return false;
    }

    @Override
    public ConnectionOwner findConnectionOwner(int ipProtocol, String src, int srcPort, String dst, int dstPort) {
        throw new UnsupportedOperationException("не нужно");
    }

    @Override
    public void startDefaultInterfaceMonitor(InterfaceUpdateListener listener) {
        net.start(listener);
    }

    @Override
    public void closeDefaultInterfaceMonitor(InterfaceUpdateListener listener) {
        net.stop();
    }

    @Override
    public NetworkInterfaceIterator getInterfaces() throws Exception {
        return net.interfaces();
    }

    @Override
    public LocalDNSTransport localDNSTransport() {
        return net.dns;
    }

    @Override
    public boolean underNetworkExtension() {
        return false;
    }

    @Override
    public boolean includeAllNetworks() {
        return false;
    }

    @Override
    public void clearDNSCache() {}

    @Override
    public WIFIState readWIFIState() {
        return null;
    }

    @Override
    public void registerMyInterface(String name) {}

    @Override
    public void sendNotification(io.nekohasekai.libbox.Notification notification) {}

    @Override
    public void cancelNotification(String identifier, int typeID) {}

    @Override
    public void startNeighborMonitor(NeighborUpdateListener listener) {}

    @Override
    public void closeNeighborMonitor(NeighborUpdateListener listener) {}

    @Override
    public boolean usePlatformShell() {
        return false;
    }

    @Override
    public void checkPlatformShell() throws Exception {
        throw new UnsupportedOperationException("нет");
    }

    @Override
    public ShellSession openShellSession(PlatformUser user, String command, StringIterator environ,
            String term, int rows, int cols) throws Exception {
        throw new UnsupportedOperationException("нет");
    }

    @Override
    public PlatformUser lookupUser(String username) throws Exception {
        throw new UnsupportedOperationException("нет");
    }

    @Override
    public String lookupSFTPServer() throws Exception {
        throw new UnsupportedOperationException("нет");
    }

    @Override
    public String readSystemSSHHostKey() throws Exception {
        throw new UnsupportedOperationException("нет");
    }

    @Override
    public String tailscaleHostname() {
        return "";
    }

    @Override
    public boolean usePlatformBridge() {
        return false;
    }

    @Override
    public BridgeSession createBridge(BridgeOptions options) throws Exception {
        throw new UnsupportedOperationException("нет");
    }

    // ─── CommandServerHandler ───────────────────────────────────────────────

    @Override
    public int connectSSHAgent() throws Exception {
        throw new UnsupportedOperationException("нет");
    }

    @Override
    public SystemProxyStatus getSystemProxyStatus() {
        return new SystemProxyStatus();
    }

    @Override
    public void serviceReload() throws Exception {
        String config = new Store(this).vpnConfig();
        if (config != null && server != null) server.startOrReloadService(withLog(config), new OverrideOptions());
    }

    @Override
    public void serviceStop() {
        shutdown();
        stopSelf();
    }

    @Override
    public void setSystemProxyEnabled(boolean enabled) {}

    @Override
    public void triggerNativeCrash() {}

    @Override
    public void writeDebugMessage(String message) {
        Log.d(TAG, message);
    }
}
