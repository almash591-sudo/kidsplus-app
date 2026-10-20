import type { KidCard, KidPhrases, QuizSettings } from '@kidsplus/shared/api';
import { useEffect, useRef, useState } from 'react';
import { sendEvent } from '../api';
import { playSequence, stopAudio } from '../audio';
import { fx } from '../fx';
import {
  CHECK_QUESTIONS,
  checkpointIndexes,
  deckCheckQuestions,
  type QuizItem,
} from '../quiz/engine';
import { QuizScreen } from '../quiz/QuizScreen';
import { Icon } from '../ui/icons';
import { CachedImg } from '../ui/CachedImg';

/** Пока звучит слово, касания ждут, но не дольше этого (вдруг голос не сообщил о конце). */
const SPEAK_WAIT_MS = 6000;

/** Смещение пальца, после которого считаем свайп. */
const SWIPE_PX = 60;

/**
 * Карточки с озвучкой (п. 5.5 ТЗ): картинка на весь экран, слово озвучивается при показе,
 * повтор — нажатием на картинку, листание — свайпом или стрелками в нижней полосе
 * (стрелки не перекрывают картинку). Каждые несколько карточек — короткая проверка:
 * «Где <слово>?» по только что показанным карточкам. Пока звучит слово, карточка и стрелки
 * не нажимаются — частые касания не обрывают его на полуслове.
 */
export function DeckScreen(props: {
  deckId: string;
  cards: KidCard[];
  quiz: QuizSettings;
  phrases: KidPhrases;
  /** Погружение: без перевода, проверки и похвала — на языке набора. */
  immersion: boolean;
  phrasesEn: KidPhrases;
  onDone: () => void;
  onExit: () => void;
}) {
  const { cards, deckId, onDone, immersion } = props;
  // Похвала в проверке — на английском, если погружение и набор английский.
  const checkPhrases = immersion && cards[0]?.word.lang === 'en' ? props.phrasesEn : props.phrases;
  const [index, setIndex] = useState(0);
  /** Откуда въезжает карточка — туда, куда листали. */
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [check, setCheck] = useState<QuizItem[] | null>(null);
  const card = cards[index]!;
  const startX = useRef<number | null>(null);
  const [checkpoints] = useState(() => checkpointIndexes(cards.length));
  /** Пройденные проверки: листание назад-вперёд их не повторяет. */
  const passed = useRef(new Set<number>());
  /** Карточка, слово которой уже договорено; again — звучит повтор по касанию. */
  const [heard, setHeard] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  /** Звучит слово (и перевод) — касания ждут. */
  const speaking = heard !== card.id || again;
  const talk = useRef(0);

  /** Слово, затем перевод (если есть и не включено погружение); договорил — касания снова работают. */
  const say = (c: KidCard) => {
    const mine = ++talk.current;
    const done = () => {
      clearTimeout(cap);
      if (talk.current !== mine) return;
      setHeard(c.id);
      setAgain(false);
    };
    const cap = setTimeout(done, SPEAK_WAIT_MS);
    void playSequence(immersion ? [c.word] : [c.word, c.translation]).then(done, done);
  };
  const repeat = () => {
    setAgain(true);
    say(card);
  };

  useEffect(() => {
    const t = talk;
    if (!check) say(card);
    return () => {
      t.current++;
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, check, immersion]);

  const finish = () => {
    sendEvent({ type: 'deck_complete', deckId, payload: { cards: cards.length } });
    onDone();
  };

  const advanceFrom = (i: number) => {
    if (i + 1 >= cards.length) return finish();
    fx.flip();
    setDir('next');
    setIndex(i + 1);
  };

  const next = () => {
    if (checkpoints.includes(index) && !passed.current.has(index)) {
      passed.current.add(index);
      // Проверка по карточкам после прошлой проверки — до текущей включительно.
      const prev = checkpoints.filter((c) => c < index).at(-1) ?? -1;
      const questions = deckCheckQuestions(
        cards,
        cards.slice(prev + 1, index + 1),
        CHECK_QUESTIONS,
        Math.random,
        immersion,
      );
      if (questions.length) return setCheck(questions);
    }
    advanceFrom(index);
  };
  const prev = () => {
    if (index === 0) return;
    fx.flip();
    setDir('prev');
    setIndex(index - 1);
  };

  if (check) {
    return (
      <QuizScreen
        key={`check-${index}`}
        source={{ deckId }}
        questions={check}
        count={check.length}
        settings={props.quiz}
        phrases={checkPhrases}
        onDone={() => {
          setCheck(null);
          advanceFrom(index);
        }}
        onExit={props.onExit}
      />
    );
  }

  return (
    <div
      className="deck-screen"
      data-testid="deck"
      data-speaking={speaking || undefined}
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (speaking) return;
        if (dx < -SWIPE_PX) next();
        else if (dx > SWIPE_PX) prev();
      }}
    >
      <button
        type="button"
        className={`deck-card from-${dir}`}
        onClick={repeat}
        disabled={speaking}
        aria-label="Повторить слово"
        data-testid="deck-card"
      >
        <CachedImg key={card.id} src={card.imageUrl} alt="" draggable={false} />
      </button>

      <div className="deck-controls">
        <button
          type="button"
          className="deck-arrow"
          aria-label="Назад"
          onClick={prev}
          disabled={index === 0 || speaking}
          data-wait={(speaking && index > 0) || undefined}
          data-testid="deck-prev"
        >
          ◀
        </button>
        <div className="deck-dots" aria-hidden="true">
          {cards.map((c, i) => (
            <span key={c.id} className={i <= index ? 'dot-on' : ''} />
          ))}
        </div>
        <button
          type="button"
          className="deck-arrow"
          aria-label="Дальше"
          onClick={next}
          disabled={speaking}
          data-wait={speaking || undefined}
          data-testid="deck-next"
        >
          ▶
        </button>
      </div>

      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={props.onExit}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
    </div>
  );
}
