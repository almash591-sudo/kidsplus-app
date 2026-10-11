package app.kidsplus.kiosk.vpn;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.DnsResolver;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.RouteInfo;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.system.ErrnoException;
import android.system.OsConstants;
import io.nekohasekai.libbox.ExchangeContext;
import io.nekohasekai.libbox.InterfaceUpdateListener;
import io.nekohasekai.libbox.Libbox;
import io.nekohasekai.libbox.LocalDNSTransport;
import io.nekohasekai.libbox.NetworkInterfaceIterator;
import io.nekohasekai.libbox.StringIterator;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Сеть телефона для sing-box (по образцу официального клиента SFA): основная сеть
 * (Wi-Fi / мобильная), список интерфейсов и системный DNS — им sing-box находит адрес VPN-сервера.
 */
public final class Net {
    private final ConnectivityManager cm;
    private volatile Network defaultNetwork;
    private volatile InterfaceUpdateListener listener;
    private ConnectivityManager.NetworkCallback callback;
    private final Executor io = Executors.newCachedThreadPool();

    public Net(Context c) {
        cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    // ─── Итераторы для libbox ──────────────────────────────────────────────

    static final class Strings implements StringIterator {
        private final List<String> items;
        private int i = 0;

        Strings(List<String> items) {
            this.items = items;
        }

        @Override
        public boolean hasNext() {
            return i < items.size();
        }

        @Override
        public int len() {
            return items.size();
        }

        @Override
        public String next() {
            return items.get(i++);
        }
    }

    static final class Interfaces implements NetworkInterfaceIterator {
        private final Iterator<io.nekohasekai.libbox.NetworkInterface> it;

        Interfaces(List<io.nekohasekai.libbox.NetworkInterface> items) {
            it = items.iterator();
        }

        @Override
        public boolean hasNext() {
            return it.hasNext();
        }

        @Override
        public io.nekohasekai.libbox.NetworkInterface next() {
            return it.next();
        }
    }

    // ─── Основная сеть ─────────────────────────────────────────────────────

    /**
     * Основная сеть без VPN (Wi-Fi / мобильная). «Активная сеть» не подходит: когда VPN включён,
     * активная сеть — сам VPN, и DNS для адреса VPN-сервера уходил бы в туннель.
     */
    private static final NetworkRequest UNDERLYING = new NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build();

    private Network underlying() {
        for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            if (c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
                    && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))
                return n;
        }
        return null;
    }

    public void start(InterfaceUpdateListener l) {
        listener = l;
        defaultNetwork = underlying();
        callback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                defaultNetwork = network;
                notifyDefault();
            }

            @Override
            public void onLinkPropertiesChanged(Network network, LinkProperties lp) {
                if (network.equals(defaultNetwork)) notifyDefault();
            }

            @Override
            public void onLost(Network network) {
                if (network.equals(defaultNetwork)) {
                    defaultNetwork = null;
                    notifyDefault();
                }
            }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            cm.registerBestMatchingNetworkCallback(UNDERLYING, callback, new Handler(Looper.getMainLooper()));
        else cm.requestNetwork(UNDERLYING, callback);
        notifyDefault();
    }

    public void stop() {
        listener = null;
        if (callback != null) {
            try {
                cm.unregisterNetworkCallback(callback);
            } catch (Exception ignored) {
                // уже снят
            }
            callback = null;
        }
    }

    private void notifyDefault() {
        InterfaceUpdateListener l = listener;
        if (l == null) return;
        Network n = defaultNetwork;
        LinkProperties lp = n == null ? null : cm.getLinkProperties(n);
        if (lp == null || lp.getInterfaceName() == null) {
            l.updateDefaultInterface("", -1, false, false);
            return;
        }
        try {
            NetworkInterface ni = NetworkInterface.getByName(lp.getInterfaceName());
            l.updateDefaultInterface(lp.getInterfaceName(), ni == null ? -1 : ni.getIndex(), false, false);
        } catch (Exception e) {
            l.updateDefaultInterface("", -1, false, false);
        }
    }

    public NetworkInterfaceIterator interfaces() throws Exception {
        List<io.nekohasekai.libbox.NetworkInterface> out = new ArrayList<>();
        List<NetworkInterface> system = Collections.list(NetworkInterface.getNetworkInterfaces());
        for (Network network : cm.getAllNetworks()) {
            LinkProperties lp = cm.getLinkProperties(network);
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (lp == null || caps == null || lp.getInterfaceName() == null) continue;
            NetworkInterface ni = null;
            for (NetworkInterface s : system) if (s.getName().equals(lp.getInterfaceName())) ni = s;
            if (ni == null) continue;
            io.nekohasekai.libbox.NetworkInterface box = new io.nekohasekai.libbox.NetworkInterface();
            box.setName(lp.getInterfaceName());
            box.setIndex(ni.getIndex());
            try {
                box.setMTU(ni.getMTU());
            } catch (Exception ignored) {
                // без MTU
            }
            List<String> dns = new ArrayList<>();
            for (InetAddress a : lp.getDnsServers()) dns.add(a.getHostAddress());
            box.setDNSServer(new Strings(dns));
            List<String> gw = new ArrayList<>();
            for (RouteInfo r : lp.getRoutes())
                if (r.getDestination().getPrefixLength() == 0 && r.getGateway() != null
                        && !r.getGateway().isAnyLocalAddress())
                    gw.add(r.getGateway().getHostAddress());
            box.setGateway(new Strings(gw));
            List<String> addrs = new ArrayList<>();
            for (InterfaceAddress a : ni.getInterfaceAddresses()) {
                String host = a.getAddress().getHostAddress();
                int pct = host.indexOf('%');
                if (pct >= 0) host = host.substring(0, pct);
                addrs.add(host + "/" + a.getNetworkPrefixLength());
            }
            box.setAddresses(new Strings(addrs));
            box.setType(caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                    ? Libbox.InterfaceTypeWIFI
                    : caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                            ? Libbox.InterfaceTypeCellular
                            : caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                                    ? Libbox.InterfaceTypeEthernet
                                    : Libbox.InterfaceTypeOther);
            int flags = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    ? OsConstants.IFF_UP | OsConstants.IFF_RUNNING
                    : 0;
            if (ni.isLoopback()) flags |= OsConstants.IFF_LOOPBACK;
            if (ni.isPointToPoint()) flags |= OsConstants.IFF_POINTOPOINT;
            if (ni.supportsMulticast()) flags |= OsConstants.IFF_MULTICAST;
            box.setFlags(flags);
            box.setMetered(!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED));
            out.add(box);
        }
        return new Interfaces(out);
    }

    // ─── Системный DNS ─────────────────────────────────────────────────────

    /** DNS через основную сеть телефона (Android DnsResolver), мимо туннеля. */
    public final LocalDNSTransport dns = new LocalDNSTransport() {
        @Override
        public boolean raw() {
            return true;
        }

        @Override
        public void exchange(ExchangeContext ctx, byte[] message) throws Exception {
            Network n = require();
            CountDownLatch done = new CountDownLatch(1);
            CancellationSignal signal = new CancellationSignal();
            ctx.onCancel(() -> {
                signal.cancel();
                done.countDown();
            });
            DnsResolver.getInstance().rawQuery(n, message, DnsResolver.FLAG_NO_RETRY, io, signal,
                    new DnsResolver.Callback<byte[]>() {
                        @Override
                        public void onAnswer(byte[] answer, int rcode) {
                            if (rcode == 0) ctx.rawSuccess(answer);
                            else ctx.errorCode(rcode);
                            done.countDown();
                        }

                        @Override
                        public void onError(DnsResolver.DnsException error) {
                            if (error.getCause() instanceof ErrnoException)
                                ctx.errnoCode(((ErrnoException) error.getCause()).errno);
                            else ctx.errorCode(2); // SERVFAIL
                            done.countDown();
                        }
                    });
            done.await(10, TimeUnit.SECONDS);
        }

        @Override
        public void lookup(ExchangeContext ctx, String network, String domain) throws Exception {
            Network n = require();
            CountDownLatch done = new CountDownLatch(1);
            CancellationSignal signal = new CancellationSignal();
            ctx.onCancel(() -> {
                signal.cancel();
                done.countDown();
            });
            DnsResolver.Callback<List<InetAddress>> cb = new DnsResolver.Callback<List<InetAddress>>() {
                @Override
                public void onAnswer(List<InetAddress> answer, int rcode) {
                    if (rcode == 0) ctx.success(join(answer));
                    else ctx.errorCode(rcode);
                    done.countDown();
                }

                @Override
                public void onError(DnsResolver.DnsException error) {
                    if (error.getCause() instanceof ErrnoException)
                        ctx.errnoCode(((ErrnoException) error.getCause()).errno);
                    else ctx.errorCode(2);
                    done.countDown();
                }
            };
            if (network.endsWith("4"))
                DnsResolver.getInstance().query(n, domain, DnsResolver.TYPE_A, DnsResolver.FLAG_NO_RETRY, io, signal, cb);
            else if (network.endsWith("6"))
                DnsResolver.getInstance().query(n, domain, DnsResolver.TYPE_AAAA, DnsResolver.FLAG_NO_RETRY, io, signal, cb);
            else DnsResolver.getInstance().query(n, domain, DnsResolver.FLAG_NO_RETRY, io, signal, cb);
            done.await(10, TimeUnit.SECONDS);
        }
    };

    private Network require() {
        Network n = defaultNetwork;
        if (n == null) n = underlying();
        if (n == null) throw new IllegalStateException("нет сети");
        return n;
    }

    private static String join(Collection<InetAddress> addrs) {
        StringBuilder sb = new StringBuilder();
        for (InetAddress a : addrs) {
            if (a == null) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(a.getHostAddress());
        }
        return sb.toString();
    }
}
