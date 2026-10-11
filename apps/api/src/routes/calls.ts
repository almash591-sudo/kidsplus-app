// Звонки внутри семьи (этап 10): сервер только соединяет участников — состояние звонка и
// пересылка описаний соединения WebRTC по живому каналу. Звук и видео через сервер не идут.
// Звонить можно только своей семье: дети и родители этого кабинета.
import { schema } from '@kidsplus/db';
import { notifyParents } from '@kidsplus/db/notify';
import {
  callStartRequest,
  callStatus,
  CALL_WAIT_MS,
  childPeer,
  DEFAULT_ICE,
  parentPeer,
  peerKind,
  peerRef,
  RING_MS,
  ringingFor,
  signalRequest,
  type CallInfo,
  type Contact,
  type MemberState,
  type Peer,
} from '@kidsplus/shared/calls';
import { pushMessages } from '@kidsplus/shared/push';
import { and, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import {
  monitorUpdate,
  noiseReport,
  NOISE_PUSH_GAP_MS,
  type MonitorSensitivity,
  type MonitorState,
} from '@kidsplus/shared/monitor';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireDevice, requireParent, requireParentOrDevice } from '../auth';
import type { Ctx } from '../context';
import { HttpError, idFrom, notFound, parse } from '../lib/http';
import { send, sse, subscribe } from '../services/live';

const { calls, callMembers, childMonitor, children, parentUsers } = schema;

const nameRequest = z.object({ displayName: z.string().trim().min(1).max(30) });

/** Ключ живого канала: телефоны ребёнка подписаны по id ребёнка, кабинет — по «p:<id>». */
const liveKey = (p: Peer) => (peerKind(p) === 'child' ? peerRef(p) : p);

export function callsRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;
  const either = requireParentOrDevice(ctx);
  const deviceOnly = requireDevice(ctx);
  const parentOnly = requireParent(ctx);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  app.addHook('onClose', async () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  });

  const me = (r: FastifyRequest): Peer =>
    r.parent ? parentPeer(r.parent.id) : childPeer(r.device!.childId);

  async function contactsAll(): Promise<Contact[]> {
    const kids = await db.select({ id: children.id, name: children.nickname }).from(children);
    const parents = await db
      .select({ id: parentUsers.id, name: parentUsers.displayName })
      .from(parentUsers);
    return [
      ...parents.map((p) => ({
        id: parentPeer(p.id),
        name: p.name ?? 'Родитель',
        kind: 'parent' as const,
      })),
      ...kids.map((k) => ({ id: childPeer(k.id), name: k.name, kind: 'child' as const })),
    ];
  }

  async function load(callId: string): Promise<CallInfo | null> {
    const [c] = await db.select().from(calls).where(eq(calls.id, callId));
    if (!c) return null;
    const rows = await db.select().from(callMembers).where(eq(callMembers.callId, callId));
    const names = new Map((await contactsAll()).map((x) => [x.id, x.name]));
    return {
      id: c.id,
      video: c.video,
      ...(c.monitor ? { monitor: true } : {}),
      from: c.createdBy as Peer,
      status: c.status as CallInfo['status'],
      members: rows.map((m) => ({
        id: m.peer as Peer,
        name: names.get(m.peer as Peer) ?? '',
        state: m.state as MemberState,
      })),
      createdAt: c.createdAt.toISOString(),
    };
  }

  const setState = (callId: string, peer: Peer, state: MemberState, from?: MemberState[]) =>
    db
      .update(callMembers)
      .set({
        state,
        ...(state === 'joined' ? { joinedAt: ctx.now() } : {}),
        ...(state === 'left' ? { leftAt: ctx.now() } : {}),
      })
      .where(
        and(
          eq(callMembers.callId, callId),
          eq(callMembers.peer, peer),
          ...(from ? [inArray(callMembers.state, from)] : []),
        ),
      )
      .returning();

  /**
   * Пересчитать статус по участникам и разослать всем. Никто не ответил за RING_MS — «пропущен».
   * Звонок закончился — оставшиеся «звонит» становятся пропущенными.
   */
  async function refresh(callId: string, broadcast = true): Promise<CallInfo | null> {
    const [c] = await db.select().from(calls).where(eq(calls.id, callId));
    if (!c) return null;
    let expired = false;
    if (c.status !== 'ended' && ctx.now().getTime() - c.createdAt.getTime() >= RING_MS) {
      const missed = await db
        .update(callMembers)
        .set({ state: 'missed' })
        .where(and(eq(callMembers.callId, callId), eq(callMembers.state, 'ringing')))
        .returning();
      expired = missed.length > 0;
    }
    let members = await db.select().from(callMembers).where(eq(callMembers.callId, callId));
    const status = callStatus(members.map((m) => ({ state: m.state as MemberState })));
    if (status === 'ended') {
      await db
        .update(callMembers)
        .set({ state: 'missed' })
        .where(and(eq(callMembers.callId, callId), eq(callMembers.state, 'ringing')));
      await db
        .update(callMembers)
        .set({ state: 'left', leftAt: ctx.now() })
        .where(and(eq(callMembers.callId, callId), eq(callMembers.state, 'joined')));
      members = await db.select().from(callMembers).where(eq(callMembers.callId, callId));
    }
    if (status !== c.status) {
      await db
        .update(calls)
        .set({
          status,
          ...(status === 'active' && !c.answeredAt ? { answeredAt: ctx.now() } : {}),
          ...(status === 'ended' ? { endedAt: ctx.now() } : {}),
        })
        .where(eq(calls.id, callId));
    }
    if (status === 'ended') {
      clearTimeout(timers.get(callId));
      timers.delete(callId);
    }
    const call = (await load(callId))!;
    if (broadcast || expired || status !== c.status)
      for (const m of members) send(liveKey(m.peer as Peer), { type: 'call', call });
    return call;
  }

  /** Мой текущий звонок: звонит мне или я в разговоре. */
  async function current(peer: Peer): Promise<CallInfo | null> {
    const rows = await db
      .select({ id: calls.id })
      .from(callMembers)
      .innerJoin(calls, eq(calls.id, callMembers.callId))
      .where(
        and(
          eq(callMembers.peer, peer),
          inArray(callMembers.state, ['ringing', 'joined']),
          ne(calls.status, 'ended'),
        ),
      )
      .orderBy(desc(calls.createdAt))
      .limit(3);
    for (const r of rows) {
      const call = await refresh(r.id, false);
      if (call && call.status !== 'ended') return call;
    }
    return null;
  }

  async function member(callId: string, peer: Peer) {
    const [row] = await db
      .select()
      .from(callMembers)
      .where(and(eq(callMembers.callId, callId), eq(callMembers.peer, peer)));
    if (!row) throw notFound('звонок не найден');
    return row;
  }

  app.get('/api/calls/contacts', { preHandler: either }, async (request) => {
    const self = me(request);
    return (await contactsAll()).filter((c) => c.id !== self);
  });

  /** Кто я в звонках: «c:<id ребёнка>» или «p:<id родителя>». */
  app.get('/api/calls/me', { preHandler: either }, async (request) => ({ id: me(request) }));

  app.get('/api/calls/ice', { preHandler: either }, () => ctx.config.ice ?? DEFAULT_ICE);

  app.get('/api/calls/current', { preHandler: either }, async (request) => ({
    call: await current(me(request)),
  }));

  app.post(
    '/api/calls',
    { preHandler: either, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply): Promise<CallInfo> => {
      const self = me(request);
      const body = parse(callStartRequest, request.body);
      const to = [...new Set(body.to)].filter((p) => p !== self);
      const family = new Set((await contactsAll()).map((c) => c.id));
      if (!to.length || to.some((p) => !family.has(p)))
        throw new HttpError(400, 'validation', 'звонить можно только своей семье');

      // Новый звонок — из прежнего (если остался висеть) выходим.
      const prev = await current(self);
      if (prev) {
        await setState(prev.id, self, 'left', ['joined']);
        await setState(prev.id, self, 'declined', ['ringing']);
        await refresh(prev.id);
      }

      const [c] = await db
        .insert(calls)
        .values({ video: body.video, createdBy: self, status: 'ringing', createdAt: ctx.now() })
        .returning();
      await db
        .insert(callMembers)
        .values([
          { callId: c!.id, peer: self, state: 'joined', joinedAt: ctx.now() },
          ...to.map((peer) => ({ callId: c!.id, peer, state: 'ringing' })),
        ]);
      timers.set(
        c!.id,
        setTimeout(() => void refresh(c!.id).catch(() => {}), RING_MS + 500),
      );

      // Родителям — push (кабинет может быть закрыт). Имя ребёнка в push не передаётся.
      const caller =
        peerKind(self) === 'child'
          ? { childId: peerRef(self) }
          : {
              parentName: (await contactsAll()).find((x) => x.id === self)?.name ?? 'Родитель',
            };
      for (const p of to.filter((x) => peerKind(x) === 'parent'))
        void notifyParents(
          db,
          ctx.push?.sender ?? null,
          pushMessages.call(c!.id, caller, body.video),
          { parentId: peerRef(p), respectKinds: true },
        );

      reply.code(201);
      return (await refresh(c!.id))!;
    },
  );

  app.post('/api/calls/:id/answer', { preHandler: either }, async (request) => {
    const callId = idFrom(request.params);
    const self = me(request);
    await member(callId, self);
    await refresh(callId, false); // вдруг уже истёк
    const [ok] = await setState(callId, self, 'joined', ['ringing']);
    if (!ok) throw new HttpError(409, 'not_ringing', 'звонок уже закончился');
    return refresh(callId);
  });

  app.post('/api/calls/:id/decline', { preHandler: either }, async (request) => {
    const callId = idFrom(request.params);
    const self = me(request);
    await member(callId, self);
    await setState(callId, self, 'declined', ['ringing']);
    return refresh(callId);
  });

  app.post('/api/calls/:id/hangup', { preHandler: either }, async (request) => {
    const callId = idFrom(request.params);
    const self = me(request);
    await member(callId, self);
    await setState(callId, self, 'left', ['joined']);
    await setState(callId, self, 'declined', ['ringing']);
    return refresh(callId);
  });

  app.post(
    '/api/calls/:id/signal',
    { preHandler: either, config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const callId = idFrom(request.params);
      const self = me(request);
      const body = parse(signalRequest, request.body);
      const [mine, theirs] = await Promise.all([
        member(callId, self),
        member(callId, body.to).catch(() => null),
      ]);
      // Пересылаем только между участниками этого звонка, которые в разговоре.
      if (mine.state !== 'joined' || theirs?.state !== 'joined')
        throw new HttpError(409, 'not_joined', 'участник не в разговоре');
      send(liveKey(body.to), {
        type: 'signal',
        callId,
        from: self,
        kind: body.type,
        data: body.data,
      });
      reply.code(204);
    },
  );

  /**
   * Киоск (служба VPN) ждёт звонка, пока экран погашен: сразу отвечает, если звонят, иначе
   * держит запрос до CALL_WAIT_MS. Звонок — киоск включает экран и открывает детское приложение.
   */
  app.get('/api/kid/calls/wait', { preHandler: deviceOnly }, async (request) => {
    const self = childPeer(request.device!.childId);
    const now = await current(self);
    if (now && ringingFor(now, self)) return { callId: now.id, wake: true };
    return new Promise<{ callId: string | null; wake: boolean }>((resolve) => {
      const done = (callId: string | null, wake = Boolean(callId)) => {
        clearTimeout(timer);
        off();
        resolve({ callId, wake });
      };
      const off = subscribe(request.device!.childId, (event) => {
        if (event?.type === 'call' && ringingFor(event.call, self)) done(event.call.id);
        // Родитель включил радионяню — экран должен показать ночной режим.
        if (event?.type === 'monitor' && event.state.on) done(null, true);
      });
      const timer = setTimeout(() => done(null), CALL_WAIT_MS);
      request.raw.on('close', () => done(null));
    });
  });

  // ─── Радионяня (этап 11) ──────────────────────────────────────────────────

  async function monitorRow(childId: string) {
    const [row] = await db.select().from(childMonitor).where(eq(childMonitor.childId, childId));
    return row ?? null;
  }

  async function monitorState(childId: string, parent?: Peer): Promise<MonitorState> {
    const row = await monitorRow(childId);
    let listening: string | null = null;
    if (parent) {
      const now = await current(parent);
      if (now?.monitor && now.members.some((m) => m.id === childPeer(childId))) listening = now.id;
    }
    return {
      on: row?.on ?? false,
      sensitivity: (row?.sensitivity ?? 'medium') as MonitorSensitivity,
      listening,
      lastNoiseAt: row?.lastNoiseAt?.toISOString() ?? null,
    };
  }

  async function setMonitor(childId: string, on: boolean, sensitivity?: MonitorSensitivity) {
    const values = { on, ...(sensitivity ? { sensitivity } : {}), updatedAt: ctx.now() };
    await db
      .insert(childMonitor)
      .values({ childId, ...values })
      .onConflictDoUpdate({ target: childMonitor.childId, set: values });
    const row = (await monitorRow(childId))!;
    send(childId, {
      type: 'monitor',
      state: { on: row.on, sensitivity: row.sensitivity as MonitorSensitivity },
    });
    // Выключили — прослушка тоже заканчивается.
    if (!on) {
      const live = await current(childPeer(childId));
      if (live?.monitor) {
        for (const m of live.members) await setState(live.id, m.id, 'left', ['joined']);
        await refresh(live.id);
      }
    }
  }

  const ownChild = async (params: unknown) => {
    const id = idFrom(params);
    const [row] = await db.select({ id: children.id }).from(children).where(eq(children.id, id));
    if (!row) throw notFound('ребёнок не найден');
    return id;
  };

  app.get('/api/kid/monitor', { preHandler: deviceOnly }, async (request) => {
    const s = await monitorState(request.device!.childId);
    return { on: s.on, sensitivity: s.sensitivity };
  });

  /** Телефон услышал шум (сам звук сюда не приходит). Родителям — push не чаще раза в 5 минут. */
  app.post(
    '/api/kid/monitor/noise',
    { preHandler: deviceOnly, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      parse(noiseReport, request.body);
      const childId = request.device!.childId;
      const row = await monitorRow(childId);
      if (!row?.on) throw new HttpError(409, 'monitor_off', 'радионяня выключена');
      await db
        .update(childMonitor)
        .set({ lastNoiseAt: ctx.now() })
        .where(eq(childMonitor.childId, childId));
      const since = new Date(ctx.now().getTime() - NOISE_PUSH_GAP_MS);
      const [first] = await db
        .update(childMonitor)
        .set({ lastAlertAt: ctx.now() })
        .where(
          and(
            eq(childMonitor.childId, childId),
            or(isNull(childMonitor.lastAlertAt), lt(childMonitor.lastAlertAt, since)),
          ),
        )
        .returning();
      if (first) void notifyParents(db, ctx.push?.sender ?? null, pushMessages.noise(childId));
      reply.code(204);
    },
  );

  app.get('/api/parent/children/:id/monitor', { preHandler: parentOnly }, async (request) =>
    monitorState(await ownChild(request.params), parentPeer(request.parent!.id)),
  );

  app.put('/api/parent/children/:id/monitor', { preHandler: parentOnly }, async (request) => {
    const childId = await ownChild(request.params);
    const body = parse(monitorUpdate, request.body);
    await setMonitor(childId, body.on, body.sensitivity);
    return monitorState(childId, parentPeer(request.parent!.id));
  });

  /**
   * «Слушать»: звонок только звуком от ребёнка к родителю. Телефон ребёнка не звонит — сразу
   * «в разговоре»; на его экране — ночной режим со значком микрофона.
   */
  app.post(
    '/api/parent/children/:id/monitor/listen',
    { preHandler: parentOnly },
    async (request, reply): Promise<CallInfo> => {
      const childId = await ownChild(request.params);
      const self = parentPeer(request.parent!.id);
      const row = await monitorRow(childId);
      if (!row?.on) await setMonitor(childId, true);
      const prev = await current(self);
      if (prev) {
        await setState(prev.id, self, 'left', ['joined']);
        await setState(prev.id, self, 'declined', ['ringing']);
        await refresh(prev.id);
      }
      const [c] = await db
        .insert(calls)
        .values({
          video: false,
          monitor: true,
          createdBy: self,
          status: 'ringing',
          createdAt: ctx.now(),
        })
        .returning();
      await db.insert(callMembers).values([
        { callId: c!.id, peer: self, state: 'joined', joinedAt: ctx.now() },
        { callId: c!.id, peer: childPeer(childId), state: 'joined', joinedAt: ctx.now() },
      ]);
      reply.code(201);
      return (await refresh(c!.id))!;
    },
  );

  // ─── Кабинет ──────────────────────────────────────────────────────────────

  /** Живой канал кабинета: входящие звонки и сигналы WebRTC. */
  app.get('/api/parent/live', { preHandler: parentOnly }, (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write('retry: 3000\n\n');
    const off = subscribe(parentPeer(request.parent!.id), (event) => {
      if (event) reply.raw.write(sse(event));
    });
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    request.raw.on('close', () => {
      clearInterval(ping);
      off();
    });
    return reply;
  });

  app.put('/api/parent/me/name', { preHandler: parentOnly }, async (request) => {
    const { displayName } = parse(nameRequest, request.body);
    await db.update(parentUsers).set({ displayName }).where(eq(parentUsers.id, request.parent!.id));
    return { displayName };
  });

  /** Журнал звонков: кто, кому, когда, сколько длился. Содержимого звонков нет нигде. */
  app.get('/api/parent/calls', { preHandler: parentOnly }, async () => {
    const rows = await db.select().from(calls).orderBy(desc(calls.createdAt)).limit(50);
    const names = new Map((await contactsAll()).map((x) => [x.id, x.name]));
    const members = rows.length
      ? await db
          .select()
          .from(callMembers)
          .where(
            inArray(
              callMembers.callId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    return rows.map((r) => ({
      id: r.id,
      video: r.video,
      monitor: r.monitor,
      from: names.get(r.createdBy as Peer) ?? '',
      members: members
        .filter((m) => m.callId === r.id && m.peer !== r.createdBy)
        .map((m) => ({ name: names.get(m.peer as Peer) ?? '', state: m.state })),
      createdAt: r.createdAt.toISOString(),
      seconds:
        r.answeredAt && r.endedAt
          ? Math.round((r.endedAt.getTime() - r.answeredAt.getTime()) / 1000)
          : 0,
    }));
  });
}
