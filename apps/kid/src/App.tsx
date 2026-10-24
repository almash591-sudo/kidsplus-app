import type { KidCategory, KidItem, KidPlaylist } from '@kidsplus/shared/api';
import type { Activity, KidToday, Subject } from '@kidsplus/shared/schedule';
import { startAutoUpdate } from '@kidsplus/shared/app-update';
import { useCallback, useEffect, useRef, useState } from 'react';
import { kidApi, NotPairedError } from './api';
import { playSequence, speechLanguages } from './audio';
import { categoriesOf, itemsOf, needsCategoryPick, restingIn } from './categories';
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
import { appPhrases, CATEGORY_DONE, LESSON_DONE, VIDEOS_REST } from './phrases';
import { knownGames } from './knownGames';
import { pauseVideos, withoutPausedVideos } from './videoPause';
import { playlistMedia, warmMedia } from './offline';
import { setServerVoice, wantSpeech } from './speechCache';
import { ru } from './games/common';
import { KidPlayer, type ExitReason } from './player/KidPlayer';
import { GameScreen } from './games/GameScreen';
import { fromKidQuestion } from './quiz/engine';
import { QuizScreen } from './quiz/QuizScreen';
import { DeckScreen } from './screens/DeckScreen';
import { CategoryScreen, HomeScreen } from './screens/HomeScreen';
import { isLessonPath } from './screens/LessonPath';
import { PairScreen } from './screens/PairScreen';
import { calledStore, RestScreen } from './screens/RestScreen';
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
type Step = { index: number; phase: 'video' | 'quiz' | 'deck' | 'game'; seq: number };

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
  const item = itemsOf(s.playlist.items, s.category)[s.step.index];
  if (!item) return null;
  const kind = item.kind === 'segment' && s.step.phase === 'quiz' ? 'segment' : item.kind;
  return { kind, id: item.id } as const;
}

/** Следующий пункт: урок идёт по кругу; в разделе после последнего — к пунктам раздела. */
function nextStep(s: State): State {
  if (s.screen !== 'run') return s;
  const items = itemsOf(s.playlist.items, s.category);
  const i = s.lesson ? (s.step.index + 1) % items.length : s.step.index + 1;
  const next = items[i];
  // Дорожка уроков: после урока — назад на дорожку, к новой звёздочке.
  const path = !s.lesson && isLessonPath(items);
  // Этап 34: подряд — только новое; дошли до пройденного — обратно в меню.
  const resting = next && !s.lesson && restingIn(items, next);
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
  useEffect(() => {
    current.current = state;
    currentToday.current = today;
  });

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
      setState((s) => {
        if (s.screen === 'run') return s;
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
          cameraOpen.current || inCallRef.current || monitorRef.current
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

  /** Назад: из урока — на «Сегодня», из раздела — к пунктам раздела. */
  const goHome = useCallback(() => {
    fx.whoosh();
    stop.current = false;
    setState((s) => {
      if (s.screen !== 'run') return s;
      if (s.lesson) return { screen: 'today', playlist: s.playlist };
      return { screen: 'home', playlist: s.playlist, category: s.category };
    });
    void load();
  }, [load]);

  /** Пункт пройден: время вышло — похвала и на «Сегодня»; иначе следующий пункт. */
  const advance = useCallback(async () => {
    const s = current.current;
    if (s.screen !== 'run') return;
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

  /** Досмотрел и есть вопросы — квиз; иначе (нет вопросов, видео недоступно) — дальше по списку. */
  const onVideoExit = useCallback(
    (reason: ExitReason) => {
      if (reason === 'exit') return goHome();
      videoErrors.current = reason === 'error' ? videoErrors.current + 1 : 0;
      if (videoErrors.current >= 2) {
        videoErrors.current = 0;
        // Скорее всего, нет связи с YouTube: полчаса без видео, совёнок зовёт поиграть.
        pauseVideos();
        void playSequence([ru(VIDEOS_REST)]);
        return goHome();
      }
      const s = current.current;
      if (s.screen !== 'run') return;
      const item = itemsOf(s.playlist.items, s.category)[s.step.index];
      if (reason === 'complete' && item?.kind === 'segment' && item.questions.length) {
        setState({ ...s, step: { ...s.step, phase: 'quiz' } });
        return;
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
      const item = itemsOf(playlist.items, state.category)[step.index]!;
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
            onDone={() => void advance()}
            onExit={goHome}
          />
        );
      }
      return (
        <KidPlayer key={`${step.seq}-video`} segment={item} from={from} onExit={onVideoExit} />
      );
    }
  }
}
