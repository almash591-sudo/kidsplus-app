import type { KidCategory } from '@kidsplus/shared/api';
import type { KidToday, Subject } from '@kidsplus/shared/schedule';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { CATEGORY_LABELS, categoryPhrase, ROOM_PHRASES } from '../phrases';
import { CHILD_CATEGORY } from '../ui/childCategories';
import { Icon } from '../ui/icons';
import { IdleHint } from '../ui/IdleHint';
import { useOwlPraise } from '../ui/useOwlPraise';
import './magic-room.css';

type RoomTime = 'morning' | 'day' | 'evening';
type Book = 'english' | 'chinese';
const TIMES: RoomTime[] = ['morning', 'day', 'evening'];
let greeted = false;
const TIME_NAMES = { morning: 'Утро', day: 'День', evening: 'Вечер' };
const asset = (name: string) => `/playroom/${name}.webp`;
const timeNow = (): RoomTime => {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'day' : 'evening';
};
const previewTime = (): RoomTime | null => {
  const value = new URLSearchParams(location.search).get('roomTime');
  return TIMES.find((time) => time === value) ?? null;
};

/** Native modal: focus stays inside, Escape/backdrop dismisses, focus returns to its toy. */
function RoomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const node = dialog.current!;
    const opener = returnFocus.current;
    node.showModal();
    return () => {
      node.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="room-sheet fairy-chest-sheet"
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="room-close"
          aria-label="Вернуться в комнату"
          onClick={onClose}
          autoFocus
        >
          <Icon name="back" size={30} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

/** Fixed places, physical toys and short feedback: reading is never required to navigate. */
export function MagicRoomScreen({
  today,
  categories,
  onSubject,
  onCategory,
  onCamera,
  onCalls,
  onAlbum,
  tools,
}: {
  today: KidToday;
  categories: KidCategory[];
  onSubject: (subject: Subject) => void;
  onCategory: (category: KidCategory) => void;
  onCamera?: (() => void) | undefined;
  onCalls?: (() => void) | undefined;
  onAlbum: () => void;
  tools: ReactNode;
}) {
  const [automaticTime, setAutomaticTime] = useState(timeNow);
  const [chosenTime, setChosenTime] = useState<RoomTime | null>(previewTime);
  const [sheet, setSheet] = useState<'chest' | 'tools' | null>(null);
  const [chestOpen, setChestOpen] = useState(false);
  const [openingBook, setOpeningBook] = useState<Book | null>(null);
  const [reaction, setReaction] = useState<'owl' | 'bunny' | null>(null);
  const praise = useOwlPraise();
  const [speech, setSpeech] = useState('');
  const [hidden, setHidden] = useState(document.hidden);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const next = today.subjects.find((subject) => !subject.done)?.subject ?? null;
  const time = chosenTime ?? automaticTime;
  const freeCategories = today.free.open ? categories : [];
  const greeting = useRef(next || today.free.open ? ROOM_PHRASES.welcome : ROOM_PHRASES.done);

  useEffect(() => {
    const update = () => {
      setAutomaticTime(timeNow());
      setHidden(document.hidden);
    };
    const timer = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      clearTimeout(navigationTimer.current);
      clearTimeout(reactionTimer.current);
    };
  }, []);
  useEffect(() => {
    // Warm alternate frames before their first interaction. The PWA also precaches these assets.
    for (const name of [
      'chest-open',
      'book-english-open',
      'book-chinese-open',
      'owl-blink',
      'owl-wave',
      'bunny-blink',
      'bunny-wave',
    ]) {
      const image = new Image();
      image.src = asset(name);
      void image.decode().catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    if (greeted) return;
    greeted = true;
    void playSequence([ru(greeting.current)]);
  }, []);

  function respond(character: 'owl' | 'bunny', phrase: string) {
    setReaction(character);
    setSpeech(phrase);
    clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => {
      setReaction(null);
      setSpeech('');
    }, 2200);
    fx.bell(character === 'owl' ? 0 : 1);
    void playSequence([ru(phrase)]);
  }

  function canOpen(category: KidCategory) {
    return (
      today.subjects.some((subject) => subject.subject === category && !subject.done) ||
      freeCategories.includes(category)
    );
  }

  function enter(category: KidCategory) {
    if (busy.current) return;
    if (!canOpen(category)) {
      respond('owl', ROOM_PHRASES.later);
      return;
    }
    const lesson = today.subjects.find((subject) => subject.subject === category && !subject.done);
    const book = category === 'english' || category === 'chinese' ? category : null;
    if (book) {
      setSheet(null);
      setChestOpen(false);
      setOpeningBook(book);
    }
    fx.whoosh();
    void playSequence([ru(categoryPhrase(category))]);
    const navigate = () => {
      busy.current = false;
      setOpeningBook(null);
      setSheet(null);
      if (lesson) onSubject(lesson.subject);
      else onCategory(category);
    };
    if (!book || matchMedia('(prefers-reduced-motion: reduce)').matches) return navigate();
    busy.current = true;
    navigationTimer.current = setTimeout(navigate, 780);
  }

  const directSubjects = ['math', 'english', 'chinese'] as const;
  const hint = next && directSubjects.some((subject) => subject === next) ? next : 'chest';
  const starCount = today.subjects.length;

  return (
    <main
      className="magic-room"
      data-testid="today"
      data-room-time={time}
      data-paused-motion={hidden}
    >
      <div className="room-stage" aria-label="Волшебная комната">
        <img
          className="room-background"
          src={asset(`room-${time}`)}
          alt=""
          fetchPriority="high"
          draggable={false}
        />
        <h1 className="adventure-sr-only">Волшебная комната. Поиграем?</h1>
        <button
          className="room-window"
          type="button"
          aria-label={`Окно: ${TIME_NAMES[time]}. Поменять освещение`}
          onClick={() => {
            fx.soft();
            setChosenTime(TIMES[(TIMES.indexOf(time) + 1) % TIMES.length]!);
          }}
        />
        <div
          className="room-progress"
          role="img"
          aria-label={`Завершено занятий: ${today.subjects.filter((subject) => subject.done).length} из ${starCount}`}
        >
          {today.subjects.map((subject) => (
            <img
              key={subject.subject}
              src="/games/robot-star.webp"
              className={subject.done ? 'earned' : ''}
              alt=""
              draggable={false}
            />
          ))}
        </div>
        <button
          type="button"
          className={`room-object room-house${next === 'math' ? ' room-next' : ''}`}
          data-testid="room-math"
          data-hint={hint === 'math' ? '' : undefined}
          aria-label="Домик: математика"
          aria-disabled={!canOpen('math')}
          onClick={() => enter('math')}
        >
          <img src={asset('math-house')} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className={`room-object room-owl${reaction === 'owl' || praise ? ' is-reacting' : ''}`}
          data-praising={Boolean(praise)}
          data-testid="room-owl"
          aria-label="Поговорить с совёнком"
          onClick={() => respond('owl', next ? ROOM_PHRASES.hint : ROOM_PHRASES.done)}
        >
          <img className="character-idle" src={asset('owl')} alt="" draggable={false} />
          <img className="character-blink" src={asset('owl-blink')} alt="" draggable={false} />
          <img className="character-wave" src={asset('owl-wave')} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className={`room-object room-chest${chestOpen ? ' is-open' : ''}${hint === 'chest' ? ' room-next' : ''}`}
          data-testid="room-chest"
          data-hint={hint === 'chest' && !sheet ? '' : undefined}
          aria-label="Сундучок: игры и занятия"
          aria-expanded={sheet === 'chest'}
          onClick={() => {
            if (busy.current) return;
            fx.sparkle();
            setChestOpen(true);
            busy.current = true;
            navigationTimer.current = setTimeout(
              () => {
                busy.current = false;
                setSheet('chest');
              },
              matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 620,
            );
          }}
        >
          <img className="object-closed" src={asset('chest')} alt="" draggable={false} />
          <img className="object-open" src={asset('chest-open')} alt="" draggable={false} />
        </button>
        {(['english', 'chinese'] as const).map((subject) => (
          <button
            key={subject}
            type="button"
            className={`room-object room-book room-book-${subject}${openingBook === subject ? ' is-open' : ''}${next === subject ? ' room-next' : ''}`}
            data-testid={`room-${subject}`}
            data-hint={hint === subject ? '' : undefined}
            aria-label={`Книжка: ${CATEGORY_LABELS[subject]}`}
            aria-disabled={!canOpen(subject)}
            onClick={() => enter(subject)}
          >
            <img
              className="object-closed"
              src={asset(`book-${subject}`)}
              alt=""
              draggable={false}
            />
            <img
              className="object-open"
              src={asset(`book-${subject}-open`)}
              alt=""
              draggable={false}
            />
          </button>
        ))}
        <button
          type="button"
          className="room-object room-tablet"
          data-testid="room-video"
          aria-label="Планшет: видео"
          aria-disabled={!canOpen('video')}
          onClick={() => enter('video')}
        >
          <img src={asset('tablet')} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className={`room-object room-bunny${reaction === 'bunny' ? ' is-reacting' : ''}`}
          data-testid="room-bunny"
          aria-label="Поиграть с зайчиком"
          onClick={() => respond('bunny', ROOM_PHRASES.bunny)}
        >
          <img className="character-idle" src={asset('bunny')} alt="" draggable={false} />
          <img className="character-blink" src={asset('bunny-blink')} alt="" draggable={false} />
          <img className="character-wave" src={asset('bunny-wave')} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className="room-object room-camera"
          data-testid="camera-open"
          aria-label="Фотоаппарат: камера"
          disabled={!onCamera}
          onClick={() => {
            fx.tap();
            onCamera?.();
          }}
        >
          <img src={asset('camera')} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className="room-object room-basket"
          data-testid="album-open"
          aria-label="Корзинка: мои наклейки"
          onClick={() => {
            fx.sparkle();
            onAlbum();
          }}
        >
          <img src={asset('basket')} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className="room-object room-phone"
          data-testid="calls-open"
          aria-label="Телефон: позвонить родным"
          disabled={!onCalls}
          onClick={() => {
            fx.tap();
            onCalls?.();
          }}
        >
          <img src={asset('phone')} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className="room-lantern"
          data-testid="room-tools"
          aria-label="Звёздочка: мой уголок"
          onClick={() => {
            fx.bell(0);
            setSheet('tools');
          }}
        />
        {(speech || praise) && (
          <p className={`room-speech speech-${praise ? 'owl' : reaction}`} aria-hidden="true">
            {praise ? 'Молодец!' : reaction === 'bunny' ? 'Дай пять!' : 'Я рядом!'}
          </p>
        )}
        <span className="adventure-sr-only" aria-live="polite">
          {praise || speech}
        </span>
      </div>
      {!sheet && <IdleHint first={12_000} onIdle={() => respond('owl', ROOM_PHRASES.hint)} />}
      {sheet === 'chest' && (
        <RoomSheet
          title="Поиграем!"
          onClose={() => {
            setSheet(null);
            setChestOpen(false);
          }}
        >
          <div className="room-lessons" aria-label="Занятия на сегодня">
            {today.subjects.map((subject) => (
              <button
                key={subject.subject}
                type="button"
                className={`room-choice${subject.done ? ' is-done' : ''}`}
                data-testid="subject"
                data-subject={subject.subject}
                data-done={subject.done}
                data-progress={subject.done ? 1 : subject.progress}
                disabled={subject.done}
                aria-label={`${CATEGORY_LABELS[subject.subject]}${subject.done ? ', занятие завершено' : ''}`}
                onClick={() => enter(subject.subject)}
              >
                <img src={CHILD_CATEGORY[subject.subject].picture} alt="" draggable={false} />
                <span>{CHILD_CATEGORY[subject.subject].label}</span>
                {subject.done && (
                  <img className="room-earned-star" src="/games/robot-star.webp" alt="Завершено" />
                )}
              </button>
            ))}
          </div>
          {freeCategories.length > 0 && (
            <>
              <h3>Выбирай!</h3>
              <div className="room-lessons" aria-label="Свободная игра">
                {freeCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="room-choice"
                    data-testid="category"
                    data-category={category}
                    aria-label={CATEGORY_LABELS[category]}
                    onClick={() => enter(category)}
                  >
                    <img
                      src={
                        category === 'video'
                          ? asset('tablet')
                          : category === 'english' || category === 'chinese'
                            ? asset(`book-${category}`)
                            : CHILD_CATEGORY[category].picture
                      }
                      alt=""
                      draggable={false}
                    />
                    <span>{CHILD_CATEGORY[category].label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {!today.subjects.length && !freeCategories.length && <p>{ROOM_PHRASES.done}</p>}
        </RoomSheet>
      )}
      {sheet === 'tools' && (
        <RoomSheet title="Мой уголок" onClose={() => setSheet(null)}>
          <div className="room-tools">{tools}</div>
        </RoomSheet>
      )}
    </main>
  );
}
