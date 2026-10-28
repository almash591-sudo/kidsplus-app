import type { KidCategory, KidItem, KidPlaylist } from '@kidsplus/shared/api';
import type { Activity, KidToday, Subject } from '@kidsplus/shared/schedule';
import { startAutoUpdate } from '@kidsplus/shared/app-update';
import { useCallback, useEffect, useRef, useState } from 'react';
import { kidApi, NotPairedError } from './api';
import { setErrorScreen } from './errors';
import { playSequence, speechLanguages } from './audio';
import {
  categoriesOf,
  isPathItem,
  itemsOf,
  needsCategoryPick,
  pathLength,
  restingIn,
} from './categories';
import { useBattery } from './battery';
import { BabyScreen } from './baby/BabyScreen';
import { AlbumButton, AlbumScreen } from './screens/AlbumScreen';
import { habitsStore, HabitsButton, HabitsScreen } from './screens/HabitsScreen';
import { BatteryBadge } from './BatteryBadge';
import { BrightnessButton } from './ui/Brightness';
import { CameraScreen } from './camera/CameraScreen';
import { AudioButton, AudioScreen, useAudioTracks } from './screens/AudioScreen';
import { CallOverlay } from './calls/CallOverlay';
import { CallsButton, CallsScreen } from './calls/CallsScreen';
import { callMe, onCallEvent, startCalls, useCallView } from './calls/engine';
import { MonitorScreen } from './monitor/MonitorScreen';
import { onMonitorEvent, useMonitor } from './monitor/state';
import { CameraButton, GalleryScreen } from './camera/GalleryScreen';
import { fx } from './fx';
import {
  appPhrases,
  BREAK_ASK_FAILED,
  BREAK_ASKED,
  BREAK_END,
  BREAK_NO,
  BREAK_YES,
  CATEGORY_DONE,
  LESSON_DONE,
  QUIZ_FIRST,
  VIDEOS_REST,
} from './phrases';
import {
  addScreen,
  finish,
  OVERDUE_MS,
  screenTime,
  syncBreak,
  type LocalBreak,
  type ScreenTime,
} from './eyeBreak';
import { knownGames } from './knownGames';
import { pauseVideos, withoutPausedVideos } from './videoPause';
import { quizDue } from './quizDue';
import { playlistMedia, warmMedia } from './offline';
import { setServerVoice, wantSpeech } from './speechCache';
import { ru } from './games/common';
import { KidPlayer, type ExitReason, type Watched } from './player/KidPlayer';
import { GameScreen } from './games/GameScreen';
import { fromKidQuestion } from './quiz/engine';
import { QuizScreen } from './quiz/QuizScreen';
import { DeckScreen } from './screens/DeckScreen';
import { CategoryScreen, HomeScreen } from './screens/HomeScreen';
import { PairScreen } from './screens/PairScreen';
import { calledStore, RestScreen } from './screens/RestScreen';
import { BreakScreen } from './screens/BreakScreen';
import { bedtimeStore, NightScreen, OPEN_HABITS_EVENT } from './screens/NightScreen';
import { inAndroidWebView, setVolume } from './kiosk';
import { owlBus } from './owl/bus';
import { LiveOwl } from './owl/LiveOwl';
import {
  DayOverScreen,
  ParentCorner,
  ParentMenu,
  PausedScreen,
  TodayScreen,
} from './screens/TodayScreen';

/** Где ребёнок в списке раздела: пункт и этап (видео → его квиз). */
/** seq — номер шага по порядку: урок идёт по кругу, и тот же пункт должен начаться заново. */
/** late — ушёл с видео после половины: вопросы всё равно, совёнок объясняет (этап 50). */
type Step = {
  index: number;
  phase: 'video' | 'quiz' | 'deck' | 'game';
  seq: number;
  late?: boolean;
};

/** Досмотрел больше этой доли — «Домой» ведёт не домой, а к вопросам (этап 50). */
const QUIZ_AFTER = 0.5;

/**
 * category — выбранный раздел (null — экран разделов или раздел всего один).
 * lesson — урок по предмету дня (список пунктов — сам урок, идёт по кругу, пока не выйдет время).
 */
type State =
  | { screen: 'loading' }
  | { screen: 'unpaired'; initialCode: string | null }
  | { screen: 'today'; playlist: KidPlaylist }
  | { screen: 'home'; playlist: KidPlaylist; category: KidCategory | null }
  | {
      screen: 'run';
      playlist: KidPlaylist;
      category: KidCategory | null;
      step: Step;
      lesson: Subject | null;
      /** Вопросы, не пройденные до перезапуска (этап 50): после них — сюда, в меню. */
      restored?: KidPlaylist;
    }
  | { screen: 'offline' };

/** Сигнал серверу о занятии — раз в столько миллисекунд. */
const BEAT_MS = 15_000;
/** Сколько экран не трогали, прежде чем подхватить новую версию приложения. */
const UPDATE_IDLE_MS = 2 * 60_000;

/** Код привязки из QR-ссылки вида /pair?code=XXXX. */
function codeFromLocation(): string | null {
  if (window.location.pathname !== '/pair') return null;
  return new URLSearchParams(window.location.search).get('code');
}

/** Голоса телефона сообщаются один раз за запуск — родитель увидит, если нужного языка нет. */
let voicesReported = false;
function reportVoicesOnce() {
  if (voicesReported) return;
  voicesReported = true;
  void speechLanguages()
    .then((langs) => kidApi.reportVoices(langs))
    .catch(() => {
      voicesReported = false;
    });
}

const firstPhase = (item: KidItem): Step['phase'] =>
  item.kind === 'deck' ? 'deck' : item.kind === 'interactive' ? 'game' : 'video';

const plan = (t: KidToday | null) => t?.mode === 'plan';

/** Чем ребёнок занят сейчас — для учёта времени на сервере. */
function activityOf(s: State, today: KidToday | null): Activity {
  if (!plan(today)) return null;
  if (s.screen === 'run') return s.lesson ?? 'free';
  if (s.screen === 'home') return 'free';
  return null;
}

/** Что на экране — для «Управление сейчас» в кабинете. */
function itemOf(s: State) {
  if (s.screen !== 'run') return null;
  const item = itemsOf(s.playlist.items, s.category, Boolean(s.lesson))[s.step.index];
  if (!item) return null;
  const kind = item.kind === 'segment' && s.step.phase === 'quiz' ? 'segment' : item.kind;
  return { kind, id: item.id } as const;
}

/** Где ребёнок — для отчёта о сбое (этап 51): экран, раздел, вид игры. */
function screenName(s: State): string {
  if (s.screen === 'home') return s.category ? `home:${s.category}` : 'home';
  if (s.screen !== 'run') return s.screen;
  const item = itemsOf(s.playlist.items, s.category, Boolean(s.lesson))[s.step.index];
  const what = item?.kind === 'interactive' ? `game:${item.spec.kind}` : s.step.phase;
  return s.lesson ? `${what} (${s.lesson})` : what;
}

type Run = Extract<State, { screen: 'run' }>;

/** Минуты экрана набрались — пора отдыхать (этап 50). */
const isDue = (s: ScreenTime, t: KidToday | null) =>
  Boolean(t?.eyeBreak && !s.brk && s.used >= t.eyeBreak.every * 60);

/** Из занятия — в меню: урок — на «Сегодня», раздел — к его пунктам. */
function menuOf(s: Run, isPlan: boolean): State {
  if (s.restored)
    return isPlan
      ? { screen: 'today', playlist: s.restored }
      : { screen: 'home', playlist: s.restored, category: null };
  if (s.lesson) return { screen: 'today', playlist: s.playlist };
  return { screen: 'home', playlist: s.playlist, category: s.category };
}

/** Следующий пункт: урок идёт по кругу; в разделе после последнего — к пунктам раздела. */
function nextStep(s: State): State {
  if (s.screen !== 'run') return s;
  const items = itemsOf(s.playlist.items, s.category, Boolean(s.lesson));
  const i = s.lesson ? (s.step.index + 1) % items.length : s.step.index + 1;
  const next = items[i];
  // Дорожка уроков: после урока — назад на дорожку, к новой звёздочке.
  const path = !s.lesson && isPathItem(items[s.step.index]);
  // Этап 34: подряд — только новое; дошли до пройденного — обратно в меню.
  const resting = next && !s.lesson && restingIn(items.slice(pathLength(items)), next);
  return next && !path && !resting
    ? { ...s, step: { index: i, phase: firstPhase(next), seq: s.step.seq + 1 } }
    : { screen: 'home', playlist: s.playlist, category: s.category };
}

export function App() {
  // Пришли по QR-ссылке — сначала привязка, иначе загрузка списка.
  const [state, setState] = useState<State>(() => {
    const code = codeFromLocation();
    return code ? { screen: 'unpaired', initialCode: code } : { screen: 'loading' };
  });
  const [today, setToday] = useState<KidToday | null>(null);
  const [parentMenu, setParentMenu] = useState(false);
  /** Камера или галерея поверх экрана выбора (этап 9); время занятий не тратит. */
  const [camera, setCamera] = useState<
    'camera' | 'gallery' | 'calls' | 'album' | 'audio' | 'habits' | null
  >(null);
  const callView = useCallView();
  const inCall = Boolean(
    callView?.call &&
    !callView.call.monitor &&
    callView.call.status !== 'ended' &&
    callView.call.members.some(
      (m) => m.id === callMe() && (m.state === 'ringing' || m.state === 'joined'),
    ),
  );
  const monitor = useMonitor(state.screen !== 'loading' && state.screen !== 'unpaired');
  const listening = Boolean(callView?.call?.monitor && callView.call.status === 'active');
  const inCallRef = useRef(false);
  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);
  const monitorRef = useRef(false);
  useEffect(() => {
    monitorRef.current = monitor.on;
  }, [monitor.on]);
  const cameraOpen = useRef(false);
  useEffect(() => {
    cameraOpen.current = camera !== null;
  }, [camera]);
  /** Сервер сказал: время текущего занятия вышло — доиграть пункт и закончить. */
  const stop = useRef(false);

  const current = useRef(state);
  /** Видео подряд не открылись — дальше не перебираем: скорее всего, нет связи с YouTube. */
  const videoErrors = useRef(0);
  const currentToday = useRef(today);
  /** Перерыв для глаз (этап 50): минуты у экрана — в ref (отсчёт раз в 5 с не перерисовывает). */
  const eye = useRef<ScreenTime>(screenTime.get());
  const [eyeRest, setEyeRest] = useState<LocalBreak | null>(() => screenTime.get().brk);
  /** Набралось: soon — после текущего пункта, now — сразу (длинная игра без конца). */
  const [breakDue, setBreakDue] = useState<'soon' | 'now' | null>(null);
  const watchingRef = useRef(false);
  useEffect(() => {
    current.current = state;
    currentToday.current = today;
  });
  useEffect(() => {
    setErrorScreen(inCall ? 'call' : (camera ?? screenName(state)));
  }, [state, camera, inCall]);

  const refreshToday = useCallback(async () => {
    try {
      const t = await kidApi.today();
      setToday(t);
      return t;
    } catch {
      return currentToday.current;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      // Без ответа о расписании — работаем как без расписания (разделы на выбор).
      const [full, day] = await Promise.all([
        kidApi.playlist(),
        kidApi.today().catch(() => currentToday.current),
      ]);
      // Видео не открывались — полчаса без них (этап 34).
      const playlist = { ...full, items: withoutPausedVideos(knownGames(full.items)) };
      reportVoicesOnce();
      // Нейроголос: фразы приложения озвучиваются на сервере заранее.
      setServerVoice(playlist.serverVoice, playlist.voice ?? null);
      // Просмотр из кабинета — метка «Просмотр» на всех экранах (этап 16а).
      if (playlist.preview) document.documentElement.dataset.preview = '';
      else delete document.documentElement.dataset.preview;
      wantSpeech(appPhrases(playlist));
      // Без сети занятия продолжаются: картинки и озвучка — заранее в кэш (этап 15г).
      warmMedia(playlistMedia(playlist));
      setToday(day);
      // Во время занятия список не подменяем — обновится, когда ребёнок вернётся.
      const due = playlist.baby ? null : quizDue.get();
      setState((s) => {
        if (s.screen === 'run') return s;
        // Вопросы после видео не пройдены (приложение закрывали) — сначала они (этап 50).
        if (due)
          return {
            screen: 'run',
            playlist: { ...playlist, items: [due.item] },
            category: null,
            step: { index: 0, phase: 'quiz', seq: 0, late: true },
            lesson: due.lesson,
            restored: playlist,
          };
        if (plan(day))
          return s.screen === 'home' ? { ...s, playlist } : { screen: 'today', playlist };
        return { screen: 'home', playlist, category: s.screen === 'home' ? s.category : null };
      });
    } catch (err) {
      if (err instanceof NotPairedError) setState({ screen: 'unpaired', initialCode: null });
      else
        setState((s) =>
          s.screen === 'home' || s.screen === 'run' || s.screen === 'today'
            ? s
            : { screen: 'offline' },
        );
    }
  }, []);

  useEffect(() => {
    if (codeFromLocation()) {
      // Код из адресной строки убираем, чтобы он не остался в истории.
      window.history.replaceState(null, '', '/');
    } else {
      void load();
    }
  }, [load]);

  // Родитель мог поменять список — обновляем при возвращении в приложение и раз в 5 минут.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [load]);

  // Учёт времени: сигнал серверу раз в 15 с. Свёрнутое приложение время не тратит.
  const paired = state.screen !== 'loading' && state.screen !== 'unpaired';
  const battery = useBattery(paired);
  // Звонки: клиент — после привязки; вернулись на экран — сверяем звонок с сервером.
  useEffect(() => {
    if (!paired) return;
    void startCalls();
    const onVisible = () =>
      document.visibilityState === 'visible' && void startCalls().then((e) => e?.sync());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [paired]);
  // Киоск (без service worker, приложение открыто сутками): новая версия на сервере —
  // перезагрузка, только пока ребёнок ничем не занят: на главном экране, без игры, звонка,
  // камеры, ночи и меню родителя, и 2 минуты никто не трогал экран. Вне киоска обновляет SW.
  const parentMenuRef = useRef(false);
  useEffect(() => {
    parentMenuRef.current = parentMenu;
  }, [parentMenu]);
  useEffect(() => {
    if (!inAndroidWebView()) return;
    let touchedAt = Date.now();
    const touched = () => (touchedAt = Date.now());
    window.addEventListener('pointerdown', touched, true);
    const stop = startAutoUpdate({
      canReload: () => {
        const s = current.current.screen;
        return (
          (s === 'home' || s === 'today' || s === 'offline') &&
          !cameraOpen.current &&
          !inCallRef.current &&
          !monitorRef.current &&
          !parentMenuRef.current &&
          currentToday.current?.bedtime?.phase !== 'night' &&
          Date.now() - touchedAt > UPDATE_IDLE_MS
        );
      },
    });
    return () => {
      stop();
      window.removeEventListener('pointerdown', touched, true);
    };
  }, []);

  const isPlan = plan(today);
  // «Тебя зовут!» (этап 29): свежий вызов (до 3 минут) — слою поверх приложения (main.tsx).
  const calledAt = today?.calledAt ?? null;
  useEffect(() => calledStore.set(calledAt), [calledAt]);
  // «Пора спать» (этап 31): расписание сна — слою «Скоро спать» / «Доброе утро».
  const bedtime = today?.bedtime ?? null;
  useEffect(() => bedtimeStore.set(paired ? bedtime : null), [paired, bedtime]);
  useEffect(() => {
    const open = () => setCamera('habits');
    addEventListener(OPEN_HABITS_EVENT, open);
    return () => removeEventListener(OPEN_HABITS_EVENT, open);
  }, []);
  // Громкость телефона, заданная родителем (киоск).
  const volume = today?.volume ?? null;
  useEffect(() => {
    if (volume !== null) setVolume(volume);
  }, [volume]);
  /** Сигнал серверу; возвращает, вышло ли время текущего занятия. */
  const beat = useCallback(async () => {
    const s = current.current;
    try {
      const r = await kidApi.heartbeat({
        activity:
          cameraOpen.current || inCallRef.current || monitorRef.current || eye.current.brk
            ? null
            : activityOf(s, currentToday.current),
        active: document.visibilityState === 'visible',
        item: itemOf(s),
      });
      stop.current = r.stop;
      setToday(r);
    } catch {
      // нет связи — время не засчитается, попробуем через 15 с
    }
    return stop.current;
  }, []);
  useEffect(() => {
    if (!paired || !isPlan) return;
    const timer = setInterval(() => void beat(), BEAT_MS);
    return () => clearInterval(timer);
  }, [paired, isPlan, beat]);
  // Без расписания сигналов нет — день (и время отбоя, этап 31) перечитываем раз в минуту.
  useEffect(() => {
    if (!paired || isPlan) return;
    const timer = setInterval(() => void refreshToday(), 60_000);
    return () => clearInterval(timer);
  }, [paired, isPlan, refreshToday]);
  // Сменилось занятие или пункт — сразу сообщаем (время прошлого засчитается по нему).
  const activityNow = activityOf(state, today);
  const itemNow = itemOf(state)?.id ?? null;
  useEffect(() => {
    if (paired && isPlan) void beat();
  }, [paired, isPlan, activityNow, itemNow, beat]);

  // «Мои дела» (этап 30): загружаются, пока телефон привязан (кнопка в доке, напоминания).
  useEffect(() => {
    if (!paired) return;
    habitsStore.start();
    return () => habitsStore.stop();
  }, [paired]);

  // Живой канал: родитель нажал «пауза», «+10 минут» — сразу перечитываем день.
  useEffect(() => {
    if (!paired || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/kid/live');
    es.addEventListener('day', () => {
      void refreshToday();
      void habitsStore.refresh();
    });
    // Звонки (этап 10): состояние звонка и сигналы соединения.
    const onCall = (e: Event) => onCallEvent((e as MessageEvent<string>).data);
    es.addEventListener('call', onCall);
    es.addEventListener('signal', onCall);
    es.addEventListener('monitor', (e) => onMonitorEvent((e as MessageEvent<string>).data));
    return () => es.close();
  }, [paired, refreshToday]);

  // ─── Перерыв для глаз (этап 50) ───
  const putEye = useCallback((s: ScreenTime) => {
    eye.current = s;
    screenTime.set(s);
    setEyeRest(s.brk);
  }, []);
  // Отсчёт экрана: раз в 5 с, пока ребёнок смотрит (не звонок, не ночь, не аудиотека…).
  useEffect(() => {
    const timer = setInterval(() => {
      const t = currentToday.current;
      if (!t?.eyeBreak || !watchingRef.current || document.visibilityState !== 'visible') return;
      const s = addScreen(eye.current, Date.now(), t.eyeBreak.rest);
      eye.current = s;
      screenTime.set(s);
      if (!isDue(s, t)) return;
      setBreakDue(s.used * 1000 - t.eyeBreak.every * 60_000 >= OVERDUE_MS ? 'now' : 'soon');
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  // Ответ сервера: родитель разрешил или отказал, перерыв кончился, перерыв после перезапуска.
  useEffect(() => {
    if (!paired || !today) return;
    const { next, news } = syncBreak(eye.current, today.eyeBreak ?? null, Date.now());
    putEye(next);
    if (!isDue(next, today)) setBreakDue(null);
    if (news === 'no') void playSequence([ru(BREAK_NO)]);
    if (news === 'yes' || news === 'end') {
      void playSequence([ru(news === 'yes' ? BREAK_YES : BREAK_END)]);
      void load();
    }
  }, [paired, today, putEye, load]);
  // Отдых по часам телефона — и без связи.
  useEffect(() => {
    if (!eyeRest) return;
    const timer = setTimeout(
      () => {
        putEye(finish(eye.current, Date.now()));
        setBreakDue(null);
        void playSequence([ru(BREAK_END)]);
        void load();
      },
      Math.max(0, eyeRest.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [eyeRest, putEye, load]);
  // Ответ родителя приходит живым каналом; канал оборвался (VPN) — сами спрашиваем раз в 20 с.
  const resting = eyeRest !== null;
  useEffect(() => {
    if (!paired || !resting) return;
    const timer = setInterval(() => void refreshToday(), 20_000);
    return () => clearInterval(timer);
  }, [paired, resting, refreshToday]);
  /** Время экрана вышло: из занятия — в меню, совёнок объявляет отдых; сервер запоминает. */
  const startBreak = useCallback(async () => {
    const t = currentToday.current?.eyeBreak;
    if (!t || eye.current.brk) return;
    setBreakDue(null);
    const s = current.current;
    if (s.screen === 'run') {
      stop.current = false;
      setState(menuOf(s, plan(currentToday.current)));
    }
    const now = Date.now();
    putEye({
      ...eye.current,
      brk: { id: `local-${now}`, until: now + t.rest * 60_000, ask: null },
    });
    try {
      setToday(await kidApi.eyeBreak('start'));
    } catch {
      // без связи — отдых по часам телефона, спросить родителей не получится
    }
  }, [putEye]);
  /** «Очень хочется ещё» — совёнок спрашивает родителей (один раз за перерыв). */
  const askMore = useCallback(async () => {
    const b = eye.current.brk;
    if (!b || b.ask) return;
    fx.tap();
    putEye({ ...eye.current, brk: { ...b, ask: 'asked' } });
    let asked = false;
    try {
      const t = await kidApi.eyeBreak('ask');
      const cur = t.eyeBreak?.current;
      asked = Boolean(cur && cur.id === eye.current.brk?.id && cur.ask);
      setToday(t);
    } catch {
      // нет связи — не спросили
    }
    if (!asked && eye.current.brk)
      putEye({ ...eye.current, brk: { ...eye.current.brk, ask: 'no' } });
    void playSequence([ru(asked ? BREAK_ASKED : BREAK_ASK_FAILED)]);
  }, [putEye]);

  /** Назад: из урока — на «Сегодня», из раздела — к пунктам раздела. */
  const goHome = useCallback(() => {
    fx.whoosh();
    stop.current = false;
    setState((s) => (s.screen === 'run' ? menuOf(s, plan(currentToday.current)) : s));
    void load();
  }, [load]);

  /** Пункт пройден: время вышло — похвала и на «Сегодня»; иначе следующий пункт. */
  const advance = useCallback(async () => {
    const s = current.current;
    if (s.screen !== 'run') return;
    quizDue.clear();
    // Восстановленные вопросы пройдены или пора отдохнуть глазкам — в меню, не к следующему пункту.
    if (s.restored || isDue(eye.current, currentToday.current)) {
      fx.whoosh();
      setState(menuOf(s, plan(currentToday.current)));
      void load();
      return;
    }
    // В конце пункта спрашиваем сервер, не вышло ли время (а не ждём очередного сигнала).
    if (plan(currentToday.current) && (await beat())) {
      stop.current = false;
      fx.whoosh();
      void playSequence([ru(s.lesson ? LESSON_DONE : CATEGORY_DONE)]);
      // Урок пройден — совёнок подлетит похвалить, как только «Сегодня» откроется.
      if (s.lesson) owlBus.praise();
      setState({ screen: 'today', playlist: s.playlist });
      void load();
      return;
    }
    if (nextStep(s).screen === 'home') {
      fx.whoosh();
      void playSequence([ru(CATEGORY_DONE)]);
    }
    setState(nextStep);
  }, [load, beat]);

  /**
   * Досмотрел и есть вопросы — квиз; иначе (нет вопросов, видео недоступно) — дальше по списку.
   * «Домой» после половины видео — тоже вопросы: без них домой не уйти (этап 50).
   */
  const onVideoExit = useCallback(
    (reason: ExitReason, watched: Watched) => {
      const s = current.current;
      if (s.screen !== 'run') return;
      const item = itemsOf(s.playlist.items, s.category, Boolean(s.lesson))[s.step.index];
      const quiz = item?.kind === 'segment' && item.questions.length > 0 ? item : null;
      const late = reason === 'exit' && watched >= QUIZ_AFTER;
      if (quiz && (reason === 'complete' || late)) {
        quizDue.set(quiz, s.lesson);
        setState({ ...s, step: { ...s.step, phase: 'quiz', late } });
        return;
      }
      if (reason === 'exit') return goHome();
      videoErrors.current = reason === 'error' ? videoErrors.current + 1 : 0;
      if (videoErrors.current >= 2) {
        videoErrors.current = 0;
        // Скорее всего, нет связи с YouTube: полчаса без видео, совёнок зовёт поиграть.
        pauseVideos();
        void playSequence([ru(VIDEOS_REST)]);
        return goHome();
      }
      void advance();
    },
    [goHome, advance],
  );

  /** Урок по предмету дня: материалы приходят с сервера. */
  const startLesson = useCallback(
    async (subject: Subject) => {
      const s = current.current;
      if (s.screen !== 'today') return;
      try {
        const items = withoutPausedVideos(knownGames((await kidApi.lesson(subject)).items));
        if (!items.length) return void refreshToday();
        // В уроке бывают материалы не из списка ребёнка («Повторить») — их задания тоже озвучиваем.
        wantSpeech(appPhrases({ ...s.playlist, items }));
        stop.current = false;
        setState({
          screen: 'run',
          playlist: { ...s.playlist, items },
          category: null,
          step: { index: 0, phase: firstPhase(items[0]!), seq: 0 },
          lesson: subject,
        });
      } catch {
        // нет связи — ребёнок нажмёт ещё раз
      }
    },
    [refreshToday],
  );

  // Камера — всегда в окне дня: и после того как время занятий вышло, но не на паузе и не ночью.
  const cameraAllowed =
    paired && (!isPlan || !today || (!today.paused && (!today.closed || today.closed === 'limit')));
  // Аудиотека — в окне дня, как камера (после уроков тоже можно слушать).
  const tracks = useAudioTracks(paired);
  const audioAllowed = cameraAllowed && tracks.length > 0;
  const corner = (
    <>
      <ParentCorner onUnlock={() => setParentMenu(true)} />
      <BatteryBadge battery={battery} />
      {(cameraAllowed || paired) && (
        <nav className="dock" aria-label="Камера и звонки">
          {cameraAllowed && <CameraButton onOpen={() => setCamera('camera')} />}
          {paired && <CallsButton onOpen={() => setCamera('calls')} />}
          <AlbumButton onOpen={() => setCamera('album')} />
          {paired && <HabitsButton onOpen={() => setCamera('habits')} />}
          {audioAllowed && <AudioButton onOpen={() => setCamera('audio')} />}
          <BrightnessButton />
        </nav>
      )}
    </>
  );
  // Живой совёнок (этап 32) — только в меню: не на уроке, не на паузе и не ночью.
  const owl = <LiveOwl evening={bedtime?.phase === 'soon' || new Date().getHours() >= 19} />;
  // Перерыв для глаз (этап 50): «у экрана» — меню, занятия, камера, альбом, дела. Не считаются
  // звонок, радионяня, ночь, «выключить экран», пауза и конец дня, аудиотека, малыш и просмотр.
  const shown = state.screen === 'today' || state.screen === 'home' || state.screen === 'run';
  const dayOff = Boolean(
    isPlan &&
    today &&
    (today.paused || today.closed === 'ended' || (today.closed && state.screen !== 'run')),
  );
  const watching = Boolean(
    paired &&
    shown &&
    today?.eyeBreak &&
    !eyeRest &&
    !state.playlist.baby &&
    !state.playlist.preview &&
    !inCall &&
    !monitor.on &&
    !parentMenu &&
    bedtime?.phase !== 'night' &&
    !today.rest &&
    camera !== 'audio' &&
    camera !== 'calls' &&
    !dayOff,
  );
  useEffect(() => {
    watchingRef.current = watching;
  });
  // Набралось — отдых в меню сразу, а в занятии — когда пункт кончится (или слишком затянулся).
  useEffect(() => {
    if (!breakDue || !watching) return;
    if (state.screen === 'run' && breakDue === 'soon') return;
    void startBreak();
  }, [breakDue, watching, state.screen, startBreak]);
  // Звонок — поверх всего: входящий видно и посреди урока, и ночью.
  if (inCall && callView) return <CallOverlay view={callView} me={callMe()!} />;
  // Радионяня: ночной экран поверх всего, кроме обычного звонка.
  if (monitor.on)
    return (
      <MonitorScreen
        sensitivity={monitor.sensitivity}
        listening={listening}
        corner={<ParentCorner onUnlock={() => setParentMenu(true)} />}
      />
    );
  if (parentMenu) return <ParentMenu onClose={() => setParentMenu(false)} />;
  // Ночь по расписанию сна — сказка, колыбельная, темнота; снимает утро или родитель.
  if (paired && bedtime?.phase === 'night')
    return (
      <>
        <NightScreen night={bedtime} />
        <ParentCorner onUnlock={() => setParentMenu(true)} />
      </>
    );
  // Родитель «выключил экран» с поводом — поверх всего, кроме звонка и меню родителя.
  if (paired && today?.rest)
    return (
      <>
        <RestScreen reason={today.rest} />
        <ParentCorner onUnlock={() => setParentMenu(true)} />
      </>
    );
  // Перерыв для глаз — поверх меню и занятий; звонок, ночь и «выключить экран» — выше.
  if (paired && eyeRest)
    return (
      <>
        <BreakScreen
          until={eyeRest.until}
          restMin={today?.eyeBreak?.rest ?? 15}
          ask={eyeRest.ask}
          onAsk={() => void askMore()}
        />
        <ParentCorner onUnlock={() => setParentMenu(true)} />
      </>
    );
  // «Мои дела» — в любое время, и после занятий (зубы чистят вечером), и на паузе.
  if (camera === 'habits' && paired)
    return (
      <HabitsScreen
        onExit={() => {
          fx.whoosh();
          setCamera(null);
        }}
      />
    );
  if (camera === 'album')
    return (
      <AlbumScreen
        onExit={() => {
          fx.whoosh();
          setCamera(null);
        }}
      />
    );
  if (camera === 'audio' && audioAllowed)
    return (
      <AudioScreen
        tracks={tracks}
        onExit={() => {
          fx.whoosh();
          setCamera(null);
        }}
      />
    );
  if (camera === 'calls' && paired) {
    return (
      <CallsScreen
        onExit={() => {
          fx.whoosh();
          setCamera(null);
        }}
      />
    );
  }
  if (camera && cameraAllowed) {
    return camera === 'camera' ? (
      <CameraScreen
        onExit={() => {
          fx.whoosh();
          setCamera(null);
        }}
        onGallery={() => setCamera('gallery')}
      />
    ) : (
      <GalleryScreen onBack={() => setCamera('camera')} />
    );
  }

  // Расписание: пауза и «завершить» от родителя — сразу; время и окно — после текущего пункта.
  if (isPlan && today && state.screen !== 'loading' && state.screen !== 'unpaired') {
    if (today.paused)
      return (
        <>
          <PausedScreen />
          {corner}
        </>
      );
    if (today.closed === 'ended' || (today.closed && state.screen !== 'run'))
      return (
        <>
          <DayOverScreen />
          {corner}
        </>
      );
  }

  switch (state.screen) {
    case 'loading':
      return <div className="screen center" data-testid="loading" />;
    case 'offline':
      return (
        <div className="screen center" data-testid="offline">
          <button
            type="button"
            className="big-button"
            aria-label="Повторить"
            onClick={() => void load()}
          >
            ↻
          </button>
        </div>
      );
    case 'unpaired':
      return <PairScreen initialCode={state.initialCode} onPaired={() => void load()} />;
    case 'today':
      // Малыш (до 1,5 лет): свой экран вместо занятий (этап 16б).
      if (state.playlist.baby)
        return (
          <>
            <BabyScreen playlist={state.playlist} />
            <BatteryBadge battery={battery} />
            {/* Уголок родителя: PIN → Wi-Fi и настройки (в машине — раздача с телефона мамы). */}
            <ParentCorner onUnlock={() => setParentMenu(true)} />
          </>
        );
      return (
        <>
          <TodayScreen
            today={today!}
            onSubject={(subject) => void startLesson(subject)}
            onFree={() => setState({ screen: 'home', playlist: state.playlist, category: null })}
          />
          {corner}
          {owl}
        </>
      );
    case 'home': {
      const { playlist, category } = state;
      if (playlist.baby)
        return (
          <>
            <BabyScreen playlist={playlist} />
            <BatteryBadge battery={battery} />
            <ParentCorner onUnlock={() => setParentMenu(true)} />
          </>
        );
      // В режиме плана — назад к «Сегодня».
      const toToday = isPlan
        ? () => {
            fx.whoosh();
            setState({ screen: 'today', playlist });
          }
        : undefined;
      if (needsCategoryPick(playlist.items, category)) {
        return (
          <>
            <CategoryScreen
              items={playlist.items}
              onPick={(c) => setState({ screen: 'home', playlist, category: c })}
              onBack={toToday}
            />
            {corner}
            {owl}
          </>
        );
      }
      const items = itemsOf(playlist.items, category);
      return (
        <>
          <HomeScreen
            items={items}
            onBack={
              categoriesOf(playlist.items).length > 1
                ? () => setState({ screen: 'home', playlist, category: null })
                : toToday
            }
            onPick={(index) =>
              setState({
                screen: 'run',
                playlist,
                category,
                step: { index, phase: firstPhase(items[index]!), seq: 0 },
                lesson: null,
              })
            }
          />
          {corner}
          {owl}
        </>
      );
    }
    case 'run': {
      const { playlist, step } = state;
      const item = itemsOf(playlist.items, state.category, Boolean(state.lesson))[step.index]!;
      // Этап 44: урок «Сегодня» или сам выбрал — для «Что нравится» в «Прогрессе».
      const from = state.lesson ? 'lesson' : 'free';
      if (item.kind === 'deck') {
        return (
          <DeckScreen
            key={`${step.seq}-deck`}
            deckId={item.id}
            cards={item.cards}
            quiz={playlist.quiz}
            phrases={playlist.phrases}
            immersion={playlist.immersion}
            phrasesEn={playlist.phrasesEn}
            from={from}
            onDone={() => void advance()}
            onExit={goHome}
          />
        );
      }
      if (item.kind === 'interactive') {
        return (
          <GameScreen
            key={`${step.seq}-game`}
            id={item.id}
            spec={item.spec}
            phrases={playlist.phrases}
            level={
              playlist.levels
                ? (playlist.levels.byKind[item.spec.kind] ?? playlist.levels.start)
                : undefined
            }
            from={from}
            onDone={() => void advance()}
            onExit={goHome}
          />
        );
      }
      if (step.phase === 'quiz') {
        return (
          <QuizScreen
            key={`${step.seq}-quiz`}
            source={{ segmentId: item.id }}
            questions={item.questions.map(fromKidQuestion)}
            settings={playlist.quiz}
            phrases={playlist.phrases}
            intro={step.late ? ru(QUIZ_FIRST) : undefined}
            onDone={() => void advance()}
          />
        );
      }
      return (
        <KidPlayer key={`${step.seq}-video`} segment={item} from={from} onExit={onVideoExit} />
      );
    }
  }
}
