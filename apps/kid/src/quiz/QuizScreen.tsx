import type { KidPhrases, QuizSettings } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { sendEvent } from '../api';
import { Celebrate } from '../Celebrate';
import { fx } from '../fx';
import { playSequence, playSpeech, stopAudio } from '../audio';
import {
  isRapidGuessing,
  MIN_LOCK_MS,
  optionsFor,
  pickQuestions,
  RAPID_PAUSE_MS,
  WRONG_LOCK_MS,
  type QuizItem,
} from './engine';
import { burst } from '../games/juice';
import { praisePhrase, retryPhrase, slowPhrase, streak, STREAK_EVERY, vary } from '../variety';
import { Icon } from '../ui/icons';
import { CachedImg } from '../ui/CachedImg';

/** Откуда квиз: вопросы к видео или проверка по набору карточек (для аналитики). */
export type QuizSource = { segmentId: string } | { deckId: string };

/** Поля события: вопрос к видео — segmentId и questionId; проверка — deckId и cardId. */
const eventRef = (source: QuizSource, q?: QuizItem) =>
  'segmentId' in source
    ? { segmentId: source.segmentId, ...(q ? { questionId: q.id } : {}) }
    : { deckId: source.deckId };

/** Сколько показывать «правильно», если фраза похвалы ещё не озвучена. */
const PRAISE_FALLBACK_MS = 1200;
const DONE_MS = 1800;

const now = () => Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Квиз (п. 5.4 ТЗ): после видео или проверка внутри набора карточек. Каждый раунд —
 * отдельный QuestionRound со своим состоянием. После `count` верных ответов — onDone.
 */
export function QuizScreen(props: {
  source: QuizSource;
  questions: QuizItem[];
  settings: QuizSettings;
  /** Сколько верных ответов нужно; по умолчанию — из настроек ребёнка. */
  count?: number;
  phrases: KidPhrases;
  onDone: () => void;
  onExit: () => void;
}) {
  const { source, settings, phrases, onDone } = props;
  const [queue] = useState(() => pickQuestions(props.questions, props.count ?? settings.questions));
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopAudio();
    };
  }, []);

  const onCorrect = async () => {
    if (index + 1 < queue.length) return setIndex(index + 1);
    setDone(true);
    sendEvent({ type: 'quiz_complete', ...eventRef(source), payload: { questions: queue.length } });
    const phrase = vary('done', phrases.done);
    await Promise.all([phrase ? playSpeech(phrase) : null, sleep(DONE_MS)]);
    if (alive.current) onDone();
  };

  const question = queue[index];
  if (!question) return null;

  return (
    <div className="quiz-screen" data-testid="quiz">
      {done ? (
        <Celebrate testId="quiz-done" />
      ) : (
        <QuestionRound
          key={index}
          source={source}
          question={question}
          optionCount={settings.options}
          phrases={phrases}
          onCorrect={() => void onCorrect()}
        />
      )}
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={props.onExit}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
      <div className="quiz-progress" aria-hidden="true">
        {queue.map((_, i) => (
          <span key={i} className={i < index || done ? 'star on' : 'star'}>
            ★
          </span>
        ))}
      </div>
    </div>
  );
}

type Phase = 'asking' | 'answering' | 'wrong' | 'correct' | 'paused';

/**
 * Один вопрос: озвучивается при показе, касания не принимаются, пока он звучит (и минимум 1 с);
 * верный ответ — анимация и похвала (разная, за серию — особая); неверный — вариант трясётся
 * и гаснет, телефон вздрагивает, ответы на миг закрыты; два неверных подряд в спешке —
 * «не спеши», пауза и повтор вопроса.
 */
function QuestionRound(props: {
  source: QuizSource;
  question: QuizItem;
  optionCount: number;
  phrases: KidPhrases;
  onCorrect: () => void;
}) {
  const { question, phrases } = props;
  const [options] = useState(() => optionsFor(question, props.optionCount));
  const [phase, setPhase] = useState<Phase>('asking');
  const [faded, setFaded] = useState<ReadonlySet<string>>(new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const shownAt = useRef(0);
  const attempts = useRef(0);
  const wrongTaps = useRef<number[]>([]);
  const alive = useRef(true);

  /** Озвучить вопрос; открыть ответы не раньше окончания звука и не раньше MIN_LOCK_MS. */
  const ask = async () => {
    await Promise.all([playSequence(question.prompt), sleep(MIN_LOCK_MS)]);
    if (alive.current) setPhase('answering');
  };

  useEffect(() => {
    alive.current = true;
    shownAt.current = now();
    void ask();
    return () => {
      alive.current = false;
    };
    // Вопрос задаётся один раз при показе раунда.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repeat = () => {
    setPhase('asking');
    void ask();
  };

  const tap = async (optionId: string, isCorrect: boolean) => {
    if (phase !== 'answering' || faded.has(optionId)) return;
    attempts.current++;

    if (isCorrect) {
      fx.success();
      setPhase('correct');
      setChosen(optionId);
      sendEvent({
        type: 'quiz_answer',
        ...eventRef(props.source, question),
        payload: {
          ...(question.cardId ? { cardId: question.cardId } : {}),
          firstTry: attempts.current === 1,
          attempts: attempts.current,
          timeMs: now() - shownAt.current,
        },
      });
      const phrase = praisePhrase(phrases);
      if (streak.get() % STREAK_EVERY === 0) burst(undefined, 24);
      // Этап 39: за похвалой — сам ответ («Молодец! Это кошка.»), чтобы закрепить.
      const said = [...(phrase ? [phrase] : []), ...(question.answer ?? [])];
      await Promise.all([said.length ? playSequence(said) : null, sleep(PRAISE_FALLBACK_MS)]);
      if (alive.current) props.onCorrect();
      return;
    }

    // Неверно: вариант трясётся и гаснет, телефон вздрагивает, ответы на миг закрыты.
    fx.wrong();
    setFaded((f) => new Set(f).add(optionId));
    setPhase('wrong');
    wrongTaps.current.push(now());
    if (isRapidGuessing(wrongTaps.current)) {
      // Тыкает наугад — «не спеши», пауза и повтор вопроса.
      setPhase('paused');
      wrongTaps.current = [];
      stopAudio();
      const slow = slowPhrase(phrases);
      await Promise.all([slow ? playSpeech(slow) : null, sleep(RAPID_PAUSE_MS)]);
      if (alive.current) repeat();
      return;
    }
    const phrase = retryPhrase(phrases);
    if (phrase) void playSpeech(phrase);
    await sleep(WRONG_LOCK_MS);
    if (alive.current) setPhase((p) => (p === 'wrong' ? 'answering' : p));
  };

  return (
    <div className="quiz-round" data-phase={phase} data-testid="quiz-round">
      <div className={`quiz-options count-${options.length}`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={[
              'quiz-option',
              faded.has(o.id) ? 'faded' : '',
              chosen === o.id ? 'chosen' : '',
            ].join(' ')}
            onPointerDown={(e) => {
              e.preventDefault();
              void tap(o.id, o.isCorrect);
            }}
            data-testid="quiz-option"
            data-correct={o.isCorrect ? '1' : '0'}
            aria-label="Вариант ответа"
          >
            <CachedImg src={o.imageUrl} alt="" draggable={false} />
          </button>
        ))}
      </div>
      {phase === 'paused' && (
        <div className="quiz-think" data-testid="quiz-think" aria-hidden="true">
          <img src="/owl/point.webp" alt="" draggable={false} />
        </div>
      )}
      <button
        type="button"
        className="corner-button ear"
        aria-label="Повторить вопрос"
        disabled={phase !== 'answering' && phase !== 'wrong'}
        onClick={repeat}
        data-testid="repeat"
      >
        👂
      </button>
    </div>
  );
}
