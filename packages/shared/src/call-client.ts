// Клиент звонков для браузера (детское приложение и кабинет, этап 10): каждый участник
// соединён с каждым (до 4), звук и видео — напрямую по WebRTC. Сервер присылает состояние
// звонка и пересылает описания соединения (offer / answer / кандидаты ICE).
import {
  initiates,
  peersToConnect,
  type CallEvent,
  type CallInfo,
  type IceConfig,
  type Peer,
} from './calls';

/** Запрос к API (путь без /api). */
export type CallRequest = (
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<unknown>;

export interface CallView {
  call: CallInfo | null;
  local: MediaStream | null;
  remotes: { peer: Peer; stream: MediaStream; state: RTCPeerConnectionState }[];
  mic: boolean;
  cam: boolean;
  /** Камера или микрофон недоступны. */
  mediaError: boolean;
}

/** Видео для звонка через VPN: 480p, не больше ~0,8 Мбит/с на собеседника. */
const VIDEO: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: 'user',
};
const MAX_VIDEO_BITRATE = 800_000;

interface PeerLink {
  pc: RTCPeerConnection;
  stream: MediaStream;
  pendingIce: RTCIceCandidateInit[];
}

export class CallEngine {
  private call: CallInfo | null = null;
  private local: MediaStream | null = null;
  private localPromise: Promise<MediaStream | null> | null = null;
  private links = new Map<Peer, PeerLink>();
  /** Сигналы, пришедшие раньше, чем сервер подтвердил «я в разговоре». */
  private early: { from: Peer; kind: 'offer' | 'answer' | 'ice'; data: unknown }[] = [];
  private ice: IceConfig | null = null;
  private mic = true;
  private cam = true;
  private mediaError = false;
  private listeners = new Set<(v: CallView) => void>();
  /** События и ответы сервера — строго по очереди: offer раньше своих кандидатов ICE. */
  private chain: Promise<unknown> = Promise.resolve();
  private creating = new Map<Peer, Promise<PeerLink>>();

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => {});
    return next;
  }

  constructor(
    readonly me: Peer,
    private readonly request: CallRequest,
  ) {}

  subscribe(fn: (v: CallView) => void) {
    this.listeners.add(fn);
    fn(this.view());
    return () => this.listeners.delete(fn);
  }

  view(): CallView {
    return {
      call: this.call,
      local: this.local,
      remotes: [...this.links].map(([peer, l]) => ({
        peer,
        stream: l.stream,
        state: l.pc.connectionState,
      })),
      mic: this.mic,
      cam: this.cam,
      mediaError: this.mediaError,
    };
  }

  private emit() {
    const v = this.view();
    this.listeners.forEach((fn) => fn(v));
  }

  // ─── Действия ─────────────────────────────────────────────────────────────

  async start(to: Peer[], video: boolean) {
    this.cam = video;
    const call = (await this.request('POST', '/calls', { to, video })) as CallInfo;
    await this.run(() => this.update(call));
  }

  async answer() {
    if (!this.call) return;
    this.cam = this.call.video;
    const call = (await this.request('POST', `/calls/${this.call.id}/answer`)) as CallInfo;
    await this.run(() => this.update(call));
  }

  async decline() {
    if (!this.call) return;
    const call = (await this.request('POST', `/calls/${this.call.id}/decline`)) as CallInfo;
    await this.run(() => this.update(call));
  }

  async hangup() {
    if (!this.call) return;
    const id = this.call.id;
    this.cleanup();
    this.emit();
    await this.request('POST', `/calls/${id}/hangup`).catch(() => {});
  }

  toggleMic() {
    this.mic = !this.mic;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = this.mic));
    this.emit();
  }

  toggleCam() {
    this.cam = !this.cam;
    this.local?.getVideoTracks().forEach((t) => (t.enabled = this.cam));
    this.emit();
  }

  /** Звонок, созданный не через start() (радионяня: «Слушать» в кабинете). */
  attach(call: CallInfo) {
    return this.run(() => this.update(call));
  }

  /** Радионяня и я слушаю: сам ничего не передаю. */
  private listener() {
    return Boolean(this.call?.monitor && this.call.from === this.me);
  }

  /** Состояние с сервера при запуске приложения или возвращении на экран. */
  async sync() {
    const r = (await this.request('GET', '/calls/current').catch(() => null)) as {
      call: CallInfo | null;
    } | null;
    if (r?.call) await this.run(() => this.update(r.call!));
    else if (this.call && this.call.status !== 'ended') {
      // Сервер звонок уже закончил, а событие мы пропустили.
      this.cleanup();
      this.emit();
    }
  }

  /** Событие живого канала. */
  handle(event: CallEvent) {
    return this.run(async () => {
      if (event.type === 'call') return this.update(event.call);
      if (!this.call || event.callId !== this.call.id) return;
      await this.onSignal(event.from, event.kind, event.data);
    });
  }

  // ─── Внутреннее ───────────────────────────────────────────────────────────

  private mine() {
    return this.call?.members.find((m) => m.id === this.me)?.state;
  }

  private async update(call: CallInfo) {
    // Чужой звонок поверх текущего разговора не показываем.
    if (
      this.call &&
      this.call.id !== call.id &&
      this.mine() === 'joined' &&
      call.status !== 'ended'
    )
      return;
    if (this.call && this.call.id !== call.id) this.cleanup();
    this.call = call;
    const state = this.mine();
    if (call.status === 'ended' || (state !== 'joined' && state !== 'ringing')) {
      this.cleanup();
      this.call = call.status === 'ended' ? call : null;
      this.emit();
      return;
    }
    if (state === 'joined') {
      await this.ensureLocal();
      const peers = peersToConnect(call, this.me);
      for (const [peer, l] of this.links)
        if (!peers.includes(peer)) {
          l.pc.close();
          this.links.delete(peer);
        }
      for (const peer of peers)
        if (!this.links.has(peer) && initiates(this.me, peer)) await this.offer(peer);
      for (const s of this.early.splice(0)) await this.onSignal(s.from, s.kind, s.data);
    }
    this.emit();
  }

  private ensureLocal(): Promise<MediaStream | null> {
    if (!this.localPromise && this.listener()) this.localPromise = Promise.resolve(null);
    if (!this.localPromise) {
      const video = Boolean(this.call?.video);
      this.localPromise = navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: video ? VIDEO : false,
        })
        .then((s) => {
          this.local = s;
          s.getVideoTracks().forEach((t) => (t.enabled = this.cam));
          s.getAudioTracks().forEach((t) => (t.enabled = this.mic));
          this.emit();
          return s;
        })
        .catch(() => {
          this.mediaError = true;
          this.emit();
          return null;
        });
    }
    return this.localPromise;
  }

  private async iceConfig(): Promise<IceConfig> {
    if (!this.ice)
      this.ice = ((await this.request('GET', '/calls/ice').catch(() => null)) as IceConfig) ?? {
        iceServers: [],
      };
    return this.ice;
  }

  /** Соединение с собеседником — ровно одно, даже если его просят одновременно. */
  private link(peer: Peer): Promise<PeerLink> {
    const existing = this.links.get(peer);
    if (existing) return Promise.resolve(existing);
    let pending = this.creating.get(peer);
    if (!pending) {
      pending = this.createLink(peer).finally(() => this.creating.delete(peer));
      this.creating.set(peer, pending);
    }
    return pending;
  }

  private async createLink(peer: Peer): Promise<PeerLink> {
    const pc = new RTCPeerConnection(await this.iceConfig());
    const l: PeerLink = { pc, stream: new MediaStream(), pendingIce: [] };
    this.links.set(peer, l);
    const local = await this.ensureLocal();
    for (const track of local?.getTracks() ?? []) {
      const sender = pc.addTrack(track, local!);
      if (track.kind === 'video') {
        const p = sender.getParameters();
        p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: MAX_VIDEO_BITRATE }];
        void sender.setParameters(p).catch(() => {});
      }
    }
    // Радионяня: слушатель только принимает звук.
    if (this.listener()) pc.addTransceiver('audio', { direction: 'recvonly' });
    // Без своего видео всё равно принимаем видео собеседника.
    if (this.call?.video && !local?.getVideoTracks().length)
      pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = (e) => {
      l.stream.addTrack(e.track);
      this.emit();
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) void this.signal(peer, 'ice', e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => this.emit();
    return l;
  }

  private signal(to: Peer, type: 'offer' | 'answer' | 'ice', data: unknown) {
    if (!this.call) return Promise.resolve();
    return this.request('POST', `/calls/${this.call.id}/signal`, { to, type, data }).catch(
      () => {},
    );
  }

  private async offer(peer: Peer) {
    const { pc } = await this.link(peer);
    await pc.setLocalDescription(await pc.createOffer());
    await this.signal(peer, 'offer', pc.localDescription!.toJSON());
  }

  private async onSignal(from: Peer, kind: 'offer' | 'answer' | 'ice', data: unknown) {
    if (this.mine() !== 'joined') {
      if (this.early.length < 200) this.early.push({ from, kind, data });
      return;
    }
    const l = await this.link(from);
    if (kind === 'ice') {
      if (l.pc.remoteDescription)
        await l.pc.addIceCandidate(data as RTCIceCandidateInit).catch(() => {});
      else l.pendingIce.push(data as RTCIceCandidateInit);
      return;
    }
    await l.pc.setRemoteDescription(data as RTCSessionDescriptionInit);
    for (const c of l.pendingIce.splice(0)) await l.pc.addIceCandidate(c).catch(() => {});
    if (kind === 'offer') {
      await l.pc.setLocalDescription(await l.pc.createAnswer());
      await this.signal(from, 'answer', l.pc.localDescription!.toJSON());
    }
    this.emit();
  }

  private cleanup() {
    for (const l of this.links.values()) l.pc.close();
    this.links.clear();
    this.early = [];
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.localPromise = null;
    this.mediaError = false;
    this.mic = true;
    this.cam = true;
  }
}
