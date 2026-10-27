import { useEffect, useRef, useState } from 'react';
import { problemAnswer, type WordProblem } from '@kidsplus/shared/games';
import {
  COMPARE_SIGN_ASK,
  GAME_INTRO,
  HOUSE_ASK,
  houseRoof,
  houseWindow,
  LESS_THAN,
  MINUS,
  MORE_THAN,
  NEIGHBOR_GAP,
  neighborAfter,
  neighborBefore,
  PLUS,
  SIGN_EQUAL,
  WILL_BE,
} from '../../phrases';
import {
  afterSpeech,
  ask,
  NUMBERS,
  praise,
  retry,
  say,
  shuffled,
  type GameProps,
  type SpecOf,
} from '../common';
import { burstAt } from '../juice';
import './count.css';

type Kind = 'numberHouse' | 'numberNeighbors' | 'compareSign' | 'wordProblem';
type Spec = SpecOf<Kind>;

/** Что на доске: домик числа, ряд чисел с пропуском, два числа со знаком или задача. */
export type CountView =
  | { kind: 'house'; roof: number; windows: [number, number]; hidden: 0 | 1; dots: boolean }
  | { kind: 'row'; cells: number[]; hidden: number }
  | { kind: 'sign'; a: number; b: number; dots: boolean }
  | { kind: 'problem'; problem: WordProblem; scene: boolean };

export interface CountRound {
  /** Чем раунд отличается от прошлого — чтобы не повторять его подряд. */
  key: string;
  view: CountView;
  /** Варианты по порядку: числа по возрастанию или знаки «<», «=», «>». */
  options: string[];
  answer: string;
  /** Задание — фразами подряд. */
  ask: string[];
  /** После похвалы — сам ответ: «три плюс четыре будет семь!». */
  right: string[];
}

const int = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

/**
 * Ответ и (choices − 1) чисел рядом с ним (не дальше трёх, а не хватит — любые из lo…hi), по
 * возрастанию. Обманки берутся вразброс, а не ближайшие: иначе ответ всегда был бы посередине.
 * prefer — что путают чаще (соседа с другой стороны), идёт первым.
 */
export function nearNumbers(
  answer: number,
  choices: number,
  lo: number,
  hi: number,
  { exclude = [], prefer = [] }: { exclude?: number[]; prefer?: number[] } = {},
): number[] {
  const ok = (x: number) => x !== answer && x >= lo && x <= hi && !exclude.includes(x);
  const all = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(ok);
  const near = shuffled(all.filter((x) => Math.abs(x - answer) <= 3 && !prefer.includes(x)));
  const far = shuffled(all.filter((x) => Math.abs(x - answer) > 3 && !prefer.includes(x)));
  const others = [...prefer.filter(ok), ...near, ...far].slice(0, choices - 1);
  return [answer, ...others].sort((a, b) => a - b);
}

function roundOf(spec: Spec): CountRound {
  switch (spec.kind) {
    case 'numberHouse': {
      const roof = pick(spec.numbers);
      const known = int(1, roof - 1);
      const hidden = Math.random() < 0.5 ? 0 : 1;
      const answer = roof - known;
      const windows: [number, number] = hidden === 1 ? [known, answer] : [answer, known];
      return {
        key: `${roof}:${windows.join('+')}`,
        view: { kind: 'house', roof, windows, hidden, dots: spec.dots },
        options: nearNumbers(answer, spec.choices, 1, 10).map(String),
        answer: String(answer),
        ask: [houseRoof(roof), houseWindow(known), HOUSE_ASK],
        right: [NUMBERS[windows[0]]!, PLUS, NUMBERS[windows[1]]!, WILL_BE, `${NUMBERS[roof]}!`],
      };
    }
    case 'numberNeighbors': {
      const { from, to } = spec;
      const mode = pick(spec.modes);
      if (mode === 'gap') {
        const a = int(from, to - 2);
        return {
          key: `gap:${a}`,
          view: { kind: 'row', cells: [a, a + 1, a + 2], hidden: 1 },
          options: nearNumbers(a + 1, spec.choices, 1, 20, { exclude: [a, a + 2] }).map(String),
          answer: String(a + 1),
          ask: [NEIGHBOR_GAP],
          right: [NUMBERS[a]!, NUMBERS[a + 1]!, `${NUMBERS[a + 2]}!`],
        };
      }
      // «Перед восемью» — семь, а путают с девятью: сосед с другой стороны — первая обманка.
      const n = mode === 'before' ? int(from + 1, to) : int(from, to - 1);
      const answer = mode === 'before' ? n - 1 : n + 1;
      const other = mode === 'before' ? n + 1 : n - 1;
      const cells = mode === 'before' ? [answer, n] : [n, answer];
      return {
        key: `${mode}:${n}`,
        view: { kind: 'row', cells, hidden: mode === 'before' ? 0 : 1 },
        options: nearNumbers(answer, spec.choices, 1, 20, { exclude: [n], prefer: [other] }).map(
          String,
        ),
        answer: String(answer),
        ask: [mode === 'before' ? neighborBefore(n) : neighborAfter(n)],
        right: [NUMBERS[cells[0]!]!, `${NUMBERS[cells[1]!]}!`],
      };
    }
    case 'compareSign': {
      // С «равно» — примерно каждая четвёртая пара одинаковая.
      const same = spec.equal && Math.random() < 0.25;
      const a = int(1, spec.max);
      let b = same ? a : int(1, spec.max - 1);
      if (!same && b >= a) b++;
      const answer = a > b ? '>' : a < b ? '<' : '=';
      return {
        key: `${a}:${b}`,
        view: { kind: 'sign', a, b, dots: spec.dots && spec.max <= 10 },
        options: spec.equal ? ['<', '=', '>'] : ['<', '>'],
        answer,
        ask: [COMPARE_SIGN_ASK],
        right: same ? [SIGN_EQUAL] : [NUMBERS[a]!, a > b ? MORE_THAN : LESS_THAN, NUMBERS[b]!],
      };
    }
    case 'wordProblem': {
      const problem = pick(spec.problems);
      const { a, b, op } = problem;
      const c = problemAnswer(problem);
      return {
        key: problem.text,
        view: { kind: 'problem', problem, scene: spec.scene },
        options: nearNumbers(c, spec.choices, 0, 10).map(String),
        answer: String(c),
        ask: [problem.text],
        right: [NUMBERS[a]!, op === 'plus' ? PLUS : MINUS, NUMBERS[b]!, WILL_BE, `${NUMBERS[c]}!`],
      };
    }
  }
}

/** Новый раунд, не такой же, как прошлый (если в уроке есть из чего выбрать). */
export function makeRound(spec: Spec, prevKey?: string): CountRound {
  let r = roundOf(spec);
  for (let i = 0; i < 20 && r.key === prevKey; i++) r = roundOf(spec);
  return r;
}

/** Точки под числом — посчитать, если цифру ещё не узнаёт. */
const Dots = ({ n, cls }: { n: number; cls?: (j: number) => string }) => (
  <span className="cnt-dots" aria-hidden="true">
    {Array.from({ length: n }, (_, j) => (
      <span key={j} className={`cnt-dot ${cls?.(j) ?? ''}`} />
    ))}
  </span>
);

function Board({ view, answer, solved }: { view: CountView; answer: string; solved: boolean }) {
  const blank = (i: number, hidden: number, value: number | string) =>
    i === hidden && !solved ? '?' : value;
  switch (view.kind) {
    case 'house': {
      const { roof, windows, hidden } = view;
      // Точки этажа: сначала левое окошко, потом правое; пустое — кружками, пока не ответили.
      const side = (j: number) => (j < windows[0] ? 0 : 1);
      return (
        <div className="cnt-house" data-testid="count-house">
          <div className="cnt-roof">{roof}</div>
          <div className="cnt-floor">
            {windows.map((w, i) => (
              <div
                key={i}
                className={[
                  'cnt-window',
                  `s${i}`,
                  i === hidden && 'empty',
                  i === hidden && solved && 'filled',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {blank(i, hidden, w)}
              </div>
            ))}
          </div>
          {view.dots && (
            <Dots n={roof} cls={(j) => (side(j) === hidden && !solved ? 'empty' : `s${side(j)}`)} />
          )}
        </div>
      );
    }
    case 'row':
      return (
        <div className="cnt-row" data-testid="count-row">
          {view.cells.map((c, i) => (
            <div
              key={i}
              className={[
                'cnt-cell',
                i === view.hidden && 'empty',
                i === view.hidden && solved && 'filled',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {blank(i, view.hidden, c)}
            </div>
          ))}
        </div>
      );
    case 'sign':
      return (
        <div className="cnt-compare" data-testid="count-compare">
          {[view.a, null, view.b].map((n, i) =>
            n === null ? (
              <div key={i} className={solved ? 'cnt-slot filled' : 'cnt-slot'}>
                {solved ? answer : '?'}
              </div>
            ) : (
              <div key={i} className="cnt-number">
                <span>{n}</span>
                {view.dots && <Dots n={n} />}
              </div>
            ),
          )}
        </div>
      );
    case 'problem': {
      const { a, b, op, emoji } = view.problem;
      // Плюс: было a, прилетают ещё b. Минус: из a уходят b (бледнеют и улетают).
      const things =
        op === 'plus'
          ? [...Array<string>(a).fill('stay'), ...Array<string>(b).fill('arrive')]
          : [...Array<string>(a - b).fill('stay'), ...Array<string>(b).fill('leave')];
      return (
        <div className="cnt-problem" data-testid="count-problem">
          {view.scene && (
            <div className="cnt-scene" aria-hidden="true">
              {things.map((cls, k) => (
                <span
                  key={k}
                  className={`cnt-thing ${cls}`}
                  style={
                    { '--k': cls === 'stay' ? k : k - things.indexOf(cls) } as React.CSSProperties
                  }
                >
                  {emoji}
                </span>
              ))}
            </div>
          )}
          <div className="cnt-sum" aria-hidden="true">
            <span>{a}</span>
            <span>{op === 'plus' ? '+' : '−'}</span>
            <span>{b}</span>
            <span>=</span>
            <span className={solved ? 'cnt-answer' : 'cnt-q'}>{solved ? answer : '?'}</span>
          </div>
        </div>
      );
    }
  }
}

/**
 * Счёт к школе: состав числа («домик»), соседи числа, знаки «больше, меньше, равно» и задачи.
 * Совёнок задаёт вопрос, ребёнок нажимает число или знак; после ответа — «три плюс четыре
 * будет семь!».
 */
export function CountGame({ spec, phrases, onFinish }: GameProps<Kind>) {
  const [round, setRound] = useState(0);
  const [r, setR] = useState(() => makeRound(spec));
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (round === 0) void ask(GAME_INTRO[spec.kind], ...r.ask);
    else void ask(...r.ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит в начале раунда
  }, [round]);

  const choose = (id: string) => {
    if (solved || wrong.includes(id)) return;
    if (id !== r.answer) {
      setWrong([...wrong, id]);
      void retry(phrases).then(() => say(...r.ask));
      return;
    }
    setSolved(true);
    burstAt(buttons.current[id] ?? null, 16);
    void afterSpeech(praise(phrases, undefined, r.right), 2300).then(() => {
      if (round + 1 >= spec.rounds) return onFinish();
      setR(makeRound(spec, r.key));
      setRound(round + 1);
      setWrong([]);
      setSolved(false);
    });
  };

  return (
    <div className={`game cnt ${spec.kind}`} data-testid="game-count" data-answer={r.answer}>
      <div className="cnt-board appear" key={`b${round}`}>
        <Board view={r.view} answer={r.answer} solved={solved} />
      </div>
      <div
        className={spec.kind === 'compareSign' ? 'cnt-options signs' : 'cnt-options'}
        key={round}
      >
        {r.options.map((o, i) => (
          <button
            key={o}
            type="button"
            ref={(el) => {
              buttons.current[o] = el;
            }}
            className={[
              'cnt-option appear',
              wrong.includes(o) && 'off',
              solved && o === r.answer && 'picked',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--i': i } as React.CSSProperties}
            data-testid="count-choice"
            data-value={o}
            data-hint={!solved && o === r.answer ? '' : undefined}
            aria-label={o === '<' ? 'меньше' : o === '>' ? 'больше' : o === '=' ? 'равно' : o}
            onClick={() => choose(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
