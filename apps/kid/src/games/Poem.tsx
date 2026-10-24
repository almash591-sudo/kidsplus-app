import {
  isClayPicture,
  lineStart,
  partSpeech,
  poemAnnounce,
  poemOf,
  type Poem as PoemData,
  type PoemChoice,
} from '@kidsplus/shared/poems';
import type { KidPhrases } from '@kidsplus/shared/api';
import { withoutStress } from '@kidsplus/shared/voice';
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { whenQuiet } from '../audio';
import {
  POEM_BLANKS,
  POEM_LEARNED,
  POEM_PART_DONE,
  POEM_QUESTIONS,
  POEM_RECALL,
  POEM_REPEAT,
  POEM_TOGETHER,
  POEM_YOUR_TURN,
  poemAnswer,
  poemCue,
} from '../phrases';
import { Icon } from '../ui/icons';
import {
  afterSpeech,
  ask,
  gameReport,
  praise,
  retry,
  say,
  setTask,
  type GameProps,
} from './common';
import {
  learnedOf,
  linePart,
  markLearned,
  poemPlan,
  turnMs,
  type BlankRound,
  type PoemStep,
  type QuestionRound,
} from './poemPlan';
import './poem.css';

/** В автотестах очередь ребёнка — миг: голос там поддельный и договаривает сразу. */
const FAST = typeof navigator !== 'undefined' && navigator.webdriver;
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, FAST ? 150 : ms));

/**
 * Шаг занятия — сценарий: фразы и паузы по очереди. Уход с шага (или из игры) его обрывает:
 * alive() становится false, и сценарий дальше не идёт.
 */
function useScript(script: (alive: () => boolean) => Promise<unknown>, deps: unknown[]) {
  useEffect(() => {
    let on = true;
    void script(() => on);
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Сказать и дождаться тишины (если ребёнок попросил повторить «ушком» — и этого тоже). */
const speak = async (...texts: string[]) => {
  await say(...texts);
  await whenQuiet();
};

/** Глиняная сцена целиком, а за ней — она же, размытая (картинки бывают разной ширины). */
function Picture({ name, dim = false }: { name: string; dim?: boolean }) {
  const src = `/poems/${name}.webp`;
  return (
    <div className={dim ? 'poem-pic dim' : 'poem-pic'} key={name} data-picture={name}>
      <img className="poem-pic-bg" src={src} alt="" draggable={false} aria-hidden="true" />
      <img className="poem-pic-img" src={src} alt="" draggable={false} />
    </div>
  );
}

/** Шрифт подписи не мельче — дальше пусть лучше переносится. */
const MIN_FONT = 13;

/**
 * Длинная часть (басня, сказка — до семи строк): шрифт подписи мельче, пока сцена и подпись не
 * встанут на экран и подпись не выйдет из-под «Дальше»; не хватило и мелкого — сцена ниже. Считаем в размерах раскладки — экран
 * появляется с анимацией (scale), она замер не сбивает. Повернули телефон — подбираем заново.
 */
function useFitText(ref: RefObject<HTMLElement | null>, key: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    const game = el?.closest<HTMLElement>('.game');
    if (!el || !game) return;
    const fits = () => {
      const g = game.getBoundingClientRect();
      const k = game.offsetHeight / g.height || 1;
      const box = (e: Element) => {
        const r = e.getBoundingClientRect();
        return {
          top: (r.top - g.top) * k,
          bottom: (r.bottom - g.top) * k,
          left: (r.left - g.left) * k,
          right: (r.right - g.left) * k,
        };
      };
      const css = getComputedStyle(game);
      const top = parseFloat(css.paddingTop) - 1;
      const bottom = game.clientHeight - parseFloat(css.paddingBottom) + 1;
      for (const c of game.children) {
        if (getComputedStyle(c).position === 'absolute') continue;
        const b = box(c);
        if (b.top < top || b.bottom > bottom) return false;
      }
      const next = game.querySelector('.poem-next');
      if (!next) return true;
      const t = box(el);
      const n = box(next);
      return t.right <= n.left || t.left >= n.right || t.bottom <= n.top - 6;
    };
    const fit = () => {
      const pic = game.querySelector<HTMLElement>('.poem-pic');
      el.style.fontSize = '';
      if (pic) pic.style.maxHeight = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      const full = pic?.offsetHeight ?? 0;
      const font = (min: number) => {
        while (size > min && !fits()) el.style.fontSize = `${--size}px`;
      };
      const scene = (share: number) => {
        for (let h = (pic?.offsetHeight ?? 0) - 8; pic && h >= full * share && !fits(); h -= 8)
          pic.style.maxHeight = `${h}px`;
      };
      // Ребёнку важнее сцена, маме — читаемая подпись: уступают по очереди.
      font(16);
      scene(0.7);
      font(MIN_FONT);
      scene(0.5);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(game);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [ref, key]);
}

/** Строки под картинкой — для тех, кто уже читает, и для мамы рядом. */
function Caption({ lines, turn = false }: { lines: readonly string[]; turn?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFitText(ref, lines.join('\n'));
  return (
    <div ref={ref} className={turn ? 'poem-text turn' : 'poem-text'} data-testid="poem-text">
      {lines.map((l, i) => (
        <p key={i}>{withoutStress(l)}</p>
      ))}
    </div>
  );
}

/** Очередь ребёнка: совёнок слушает. */
function Turn({ on }: { on: boolean }) {
  return (
    <div className={on ? 'poem-owl listen' : 'poem-owl'} data-testid={on ? 'poem-turn' : undefined}>
      <img src={on ? '/owl/happy.webp' : '/owl/talk.webp'} alt="" draggable={false} />
      {on && (
        <span className="poem-ear" aria-hidden="true">
          <Icon name="ear" size="60%" stroke={2.4} />
        </span>
      )}
    </div>
  );
}

/** 1. Послушай: часть за частью под своими картинками. */
function Listen({ poem, onDone }: { poem: PoemData; onDone: () => void }) {
  const [i, setI] = useState(0);
  const part = poem.parts[i]!;
  const next = () => (i + 1 < poem.parts.length ? setI(i + 1) : onDone());
  useScript(
    async (alive) => {
      const lines = partSpeech(part);
      setTask(() => say(...lines));
      await speak(...(i === 0 ? [poemAnnounce(poem), ...lines] : lines));
      if (!alive()) return;
      await pause(700);
      if (alive()) next();
    },
    [i],
  );
  return (
    <>
      <Picture name={part.picture} />
      <Caption lines={part.lines} />
      <button
        type="button"
        className="poem-next"
        aria-label="Дальше"
        data-testid="poem-next"
        onClick={next}
      >
        <Icon name="next" size={40} stroke={2.8} />
      </button>
    </>
  );
}

/**
 * 2. Повторяй за мной: голос — строчку, ребёнок — за ним; потом всё вместе. Выучено всё —
 * «Расскажи вместе со мной»: голос начинает строку, ребёнок продолжает, голос проверяет.
 */
function Repeat({
  poem,
  group,
  recall,
  onLearned,
  onDone,
}: {
  poem: PoemData;
  group: number;
  recall: boolean;
  onLearned: () => string | null;
  onDone: () => void;
}) {
  const lines = poem.learn[group]!;
  /** Какая строка сейчас (по ней — картинка) и что видно под картинкой. */
  const [at, setAt] = useState(lines[0]!);
  const [shown, setShown] = useState<string[]>([]);
  const [turn, setTurn] = useState(false);
  useScript(async (alive) => {
    await speak(recall ? POEM_RECALL : POEM_REPEAT);
    for (let k = 0; k < lines.length && alive(); k++) {
      const text = lines[k]!;
      const said = recall ? lineStart(text) : text;
      setAt(text);
      setShown([said]);
      setTurn(false);
      setTask(() => say(said));
      await speak(said);
      if (!alive()) return;
      setTurn(true);
      if (k === 0 && !recall) await speak(POEM_YOUR_TURN);
      if (!alive()) return;
      await pause(turnMs(text));
      // Рассказал сам — голос проверяет: вот как в стихе.
      if (recall && alive()) {
        setTurn(false);
        setShown([text]);
        await speak(text);
      }
    }
    if (!alive()) return;
    setShown(lines);
    setTurn(false);
    setTask(() => say(...lines));
    if (!recall) await speak(POEM_TOGETHER, ...lines);
    if (!alive()) return;
    const done = onLearned();
    if (done) await speak(done);
    if (alive()) onDone();
  }, []);
  return (
    <>
      <Picture name={poem.parts[linePart(poem, at)]!.picture} />
      <div className="poem-row">
        <Turn on={turn} />
        <Caption lines={shown} turn={turn} />
      </div>
    </>
  );
}

/** Вариант ответа: картинка (эмодзи или глина) и слово. */
function Option(props: {
  choice: PoemChoice;
  index: number;
  state: 'off' | 'answer' | null;
  hint: boolean;
  onPick: () => void;
}) {
  const [word, picture] = props.choice;
  return (
    <button
      type="button"
      className={['poem-option appear', props.state].filter(Boolean).join(' ')}
      style={{ '--i': props.index } as React.CSSProperties}
      data-testid="poem-option"
      data-word={word}
      data-hint={props.hint ? '' : undefined}
      onClick={props.onPick}
    >
      {isClayPicture(picture) ? (
        <img src={`/poems/${picture}.webp`} alt="" draggable={false} />
      ) : (
        <span className="poem-emoji">{picture}</span>
      )}
      <span className="poem-word">{word}</span>
    </button>
  );
}

/** Раунды выбора — «Договори» и вопросы: неверно — «попробуй ещё», верно — похвала и ответ. */
function useChoice<R extends { answer: PoemChoice }>(
  rounds: R[],
  phrases: KidPhrases,
  answer: (r: R) => string[],
  onDone: () => void,
) {
  const [n, setN] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const round = rounds[n]!;
  const pick = (c: PoemChoice) => {
    if (solved || wrong.includes(c[0])) return;
    if (c[0] !== round.answer[0]) {
      setWrong([...wrong, c[0]]);
      void retry(phrases);
      return;
    }
    setSolved(true);
    void afterSpeech(praise(phrases, undefined, answer(round)).then(whenQuiet), 1800, 30000).then(
      () => {
        if (!alive.current) return;
        if (n + 1 >= rounds.length) return onDone();
        setN(n + 1);
        setWrong([]);
        setSolved(false);
      },
    );
  };
  const state = (c: PoemChoice) =>
    solved && c[0] === round.answer[0] ? 'answer' : wrong.includes(c[0]) ? 'off' : null;
  return { n, round, solved, pick, state };
}

function Options<R extends { answer: PoemChoice; options: PoemChoice[] }>(props: {
  round: R;
  n: number;
  solved: boolean;
  state: (c: PoemChoice) => 'off' | 'answer' | null;
  pick: (c: PoemChoice) => void;
}) {
  return (
    <div className={`poem-options n${props.round.options.length}`} key={props.n}>
      {props.round.options.map((c, i) => (
        <Option
          key={c[0]}
          choice={c}
          index={i}
          state={props.state(c)}
          hint={!props.solved && c[0] === props.round.answer[0]}
          onPick={() => props.pick(c)}
        />
      ))}
    </div>
  );
}

/** 3. Договори словечко: голос замолкает перед словом — ребёнок выбирает картинку. */
function Blanks(props: {
  poem: PoemData;
  rounds: BlankRound[];
  phrases: KidPhrases;
  onDone: () => void;
}) {
  const c = useChoice(
    props.rounds,
    props.phrases,
    (r) => partSpeech(props.poem.parts[Math.max(0, r.part)]!),
    props.onDone,
  );
  const { blank, part } = c.round;
  const cue = withoutStress(blank.cue).trim();
  const cut = cue.lastIndexOf(' ');
  useScript(
    async (alive) => {
      if (c.n === 0) await speak(POEM_BLANKS);
      if (alive()) void ask(poemCue(blank.cue));
    },
    [c.n],
  );
  return (
    <>
      <Picture name={props.poem.parts[Math.max(0, part)]!.picture} dim={!c.solved} />
      <div className="poem-text cue" data-testid="poem-text">
        <p>
          {cue.slice(0, cut + 1)}
          <span className="poem-tail">
            {cue.slice(cut + 1)}{' '}
            <span className={c.solved ? 'poem-gap filled' : 'poem-gap'} data-testid="poem-gap">
              {c.solved ? blank.word : ' '}
            </span>
          </span>
        </p>
      </div>
      <Options {...c} />
    </>
  );
}

/** 4. Вопросы по смыслу: совёнок спрашивает, ответ — картинкой. */
function Questions(props: { rounds: QuestionRound[]; phrases: KidPhrases; onDone: () => void }) {
  const c = useChoice(props.rounds, props.phrases, (r) => [poemAnswer(r.answer[0])], props.onDone);
  const { question } = c.round;
  useScript(
    async (alive) => {
      if (c.n === 0) await speak(POEM_QUESTIONS);
      if (alive()) void ask(question.text);
    },
    [c.n],
  );
  return (
    <>
      <div className="poem-row ask">
        <button
          type="button"
          className="poem-owl"
          aria-label="Повторить вопрос"
          onClick={() => void say(question.text)}
        >
          <img src={c.solved ? '/owl/happy.webp' : '/owl/talk.webp'} alt="" draggable={false} />
        </button>
        <div className="poem-text" data-testid="poem-text">
          <p>{question.text}</p>
        </div>
      </div>
      <Options {...c} />
    </>
  );
}

/**
 * Стих или сказка (этап 45): послушать под глиняные картинки, повторять за голосом по частям,
 * «Договори словечко» и вопросы. Выученную часть телефон помнит — в следующий раз учим дальше.
 */
export function Poem({ spec, phrases, onFinish }: GameProps<'poem'>) {
  const poem = poemOf(spec.poem);
  const [learned] = useState(() => learnedOf(spec.poem));
  const [steps] = useState<PoemStep[]>(() => poemPlan(spec, learned));
  const [at, setAt] = useState(0);
  const step = steps[at]!;
  const groups = poem.learn.length;
  const learnedNow = useRef(learned);

  const next = () => {
    if (at + 1 < steps.length) return setAt(at + 1);
    gameReport.set({
      poem: spec.poem,
      part: learnedNow.current,
      parts: groups,
      learned: groups > 0 && learnedNow.current >= groups,
      recall: steps.some((s) => s.kind === 'recall'),
    });
    onFinish();
  };
  /** Группа строк пройдена: запомнить; что сказать — «эту часть выучили» или «всё до конца». */
  const onLearned = () => {
    if (step.kind !== 'repeat') return null;
    learnedNow.current = step.group + 1;
    markLearned(spec.poem, learnedNow.current);
    return learnedNow.current >= groups ? POEM_LEARNED : POEM_PART_DONE;
  };

  // Слушаем и повторяем за голосом — ребёнок не бездействует: подсказка «ушка» сама не
  // вклинивается (она начинала часть заново, и начало звучало дважды). Выбирать ответ — с ней.
  const voiceLed = step.kind === 'listen' || step.kind === 'repeat' || step.kind === 'recall';
  return (
    <div
      className={`game poem ${step.kind}`}
      data-testid="game-poem"
      data-poem={spec.poem}
      data-step={step.kind}
      data-learned={learned}
      data-no-idle={voiceLed || undefined}
      key={at}
    >
      {step.kind === 'listen' && <Listen poem={poem} onDone={next} />}
      {(step.kind === 'repeat' || step.kind === 'recall') && (
        <Repeat
          poem={poem}
          group={step.group}
          recall={step.kind === 'recall'}
          onLearned={onLearned}
          onDone={next}
        />
      )}
      {step.kind === 'blanks' && (
        <Blanks poem={poem} rounds={step.rounds} phrases={phrases} onDone={next} />
      )}
      {step.kind === 'questions' && (
        <Questions rounds={step.rounds} phrases={phrases} onDone={next} />
      )}
    </div>
  );
}
