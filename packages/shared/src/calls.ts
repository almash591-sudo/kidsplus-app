// Звонки внутри семьи (этап 10): 2 детских телефона и 2 родительских, до 4 участников.
// Звук и видео идут между телефонами напрямую (WebRTC, шифрование DTLS-SRTP); сервер KidsPlus
// только соединяет: кто кому звонит, ответ, «положил трубку», обмен описаниями соединения.
import { z } from 'zod';

/** Участник: ребёнок (любой его телефон) или родитель. «c:<id ребёнка>» / «p:<id родителя>». */
export type Peer = `c:${string}` | `p:${string}`;
export const peerId = z
  .string()
  .regex(/^[cp]:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  .transform((s) => s as Peer);

export const childPeer = (childId: string): Peer => `c:${childId}`;
export const parentPeer = (parentId: string): Peer => `p:${parentId}`;
export const peerKind = (p: Peer) => (p.startsWith('c:') ? 'child' : 'parent');
export const peerRef = (p: Peer) => p.slice(2);

/** Сколько звонит, пока никто не ответил. */
export const RING_MS = 45_000;
/** Участников в звонке, включая звонящего. */
export const CALL_MAX_MEMBERS = 4;
/** Долгий опрос киоска: сколько сервер держит запрос «есть ли звонок». */
export const CALL_WAIT_MS = 25_000;

export interface Contact {
  id: Peer;
  name: string;
  kind: 'child' | 'parent';
}

export type MemberState = 'ringing' | 'joined' | 'declined' | 'missed' | 'left';

export interface CallMember {
  id: Peer;
  name: string;
  state: MemberState;
}

export interface CallInfo {
  id: string;
  video: boolean;
  /** Радионяня: звук только от ребёнка к родителю; телефон ребёнка не звонит. */
  monitor?: boolean;
  from: Peer;
  status: 'ringing' | 'active' | 'ended';
  members: CallMember[];
  createdAt: string;
}

export const callStartRequest = z.object({
  to: z
    .array(peerId)
    .min(1)
    .max(CALL_MAX_MEMBERS - 1),
  video: z.boolean(),
});
export type CallStartRequest = z.input<typeof callStartRequest>;

/** Описание соединения WebRTC (SDP) или кандидат ICE — сервер только пересылает. */
export const signalRequest = z.object({
  to: peerId,
  type: z.enum(['offer', 'answer', 'ice']),
  data: z.unknown().refine((d) => JSON.stringify(d ?? null).length <= 20_000, 'слишком большое'),
});
export type SignalRequest = z.input<typeof signalRequest>;

/** События живого канала о звонках. */
export type CallEvent =
  | { type: 'call'; call: CallInfo }
  | {
      type: 'signal';
      callId: string;
      from: Peer;
      kind: 'offer' | 'answer' | 'ice';
      data: unknown;
    };

/** Серверы ICE (STUN, позже — TURN); задаются на сервере. */
export interface IceConfig {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

export const DEFAULT_ICE: IceConfig = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
};

/**
 * Кто из пары начинает соединение (отправляет offer) — по порядку идентификаторов, чтобы
 * два участника не начали навстречу друг другу.
 */
export const initiates = (me: Peer, other: Peer) => me < other;

/** С кем у меня должно быть соединение: все, кто в разговоре, кроме меня. */
export function peersToConnect(call: CallInfo, me: Peer): Peer[] {
  const meJoined = call.members.some((m) => m.id === me && m.state === 'joined');
  if (!meJoined || call.status === 'ended') return [];
  return call.members.filter((m) => m.id !== me && m.state === 'joined').map((m) => m.id);
}

/** Звонок для меня сейчас звонит (я ещё не ответил). */
export const ringingFor = (call: CallInfo, me: Peer) =>
  call.status !== 'ended' && call.members.some((m) => m.id === me && m.state === 'ringing');

/** Статус звонка по участникам. */
export function callStatus(members: Pick<CallMember, 'state'>[]): CallInfo['status'] {
  const joined = members.filter((m) => m.state === 'joined').length;
  const ringing = members.filter((m) => m.state === 'ringing').length;
  if (joined >= 2) return 'active';
  if (joined === 1 && ringing > 0) return 'ringing';
  return 'ended';
}
