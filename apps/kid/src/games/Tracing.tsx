import type { TraceGuide } from '@kidsplus/shared/games';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fx } from '../fx';
import { ask, bump, praise, say, svgPoint, type GameProps } from './common';
import { TRACE_HINT, tracePrompt, traceSelfPrompt } from '../phrases';
import { advance, LETTER_RULES, resample, TRACES, type Stroke } from './traceShapes';

type Pt = readonly [number, number];
const toPath = (pts: readonly Pt[]) =>
  pts.length ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}` : '';

/** Сколько промахов на ступени «сама», прежде чем показать линию штриха. */
const HINT_AFTER = 2;

/**
 * Обведи по точкам: ведём пальцем от зелёной точки по пунктиру; штрихи — по очереди.
 * Буквы (этап 56) — ещё и по ступеням: по точкам, по бледной линии, по образцу от точки начала.
 */
export function Tracing({ spec, phrases, onFinish }: GameProps<'tracing'>) {
  const steps = useMemo(
    () =>
      spec.shapes.flatMap((shape) => (spec.guides ?? ['dots']).map((guide) => ({ shape, guide }))),
    [spec],
  );
  const [index, setIndex] = useState(0);
  const { shape, guide } = steps[index]!;
  return (
    <TraceOne
      key={index}
      shape={shape}
      guide={guide}
      onDone={() => {
        void praise(phrases);
        setTimeout(() => {
          if (index + 1 < steps.length) setIndex(index + 1);
          else onFinish();
        }, 1300);
      }}
    />
  );
}

/** Стрелка направления у начала штриха — как в прописях. */
function Arrow({ points }: { points: readonly Pt[] }) {
  const from = points[1] ?? points[0]!;
  const to = points[Math.min(5, points.length - 1)]!;
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (!len) return null;
  const [ux, uy] = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
  // Сбоку от линии, чтобы не закрывать точки.
  const [ox, oy] = [-uy * 7, ux * 7];
  const tip: Pt = [to[0] + ox, to[1] + oy];
  const base: Pt = [tip[0] - ux * 7, tip[1] - uy * 7];
  return (
    <path
      className="trace-arrow"
      data-testid="trace-arrow"
      d={`M${(base[0] - uy * 3.2).toFixed(1)},${(base[1] + ux * 3.2).toFixed(1)} L${tip[0].toFixed(1)},${tip[1].toFixed(1)} L${(base[0] + uy * 3.2).toFixed(1)},${(base[1] - ux * 3.2).toFixed(1)}`}
    />
  );
}

/** Номера штрихов у буквы из нескольких штрихов: у начала штриха или там, где задано у буквы. */
function StrokeNumbers({ strokes, at }: { strokes: readonly Stroke[]; at?: readonly Pt[] }) {
  if (strokes.length < 2) return null;
  return strokes.map((pts, i) => {
    const [x, y] = at?.[i] ?? [pts[0]![0] - 7, pts[0]![1] + 2];
    return (
      <text key={i} x={x} y={y} className="trace-number">
        {i + 1}
      </text>
    );
  });
}

/** Линейки букв — как строка в прописи. */
const Rules = () =>
  Object.values(LETTER_RULES).map((y) => (
    <line key={y} x1={4} x2={96} y1={y} y2={y} className="trace-rule" />
  ));

function TraceOne({
  shape,
  guide,
  onDone,
}: {
  shape: keyof typeof TRACES;
  guide: TraceGuide;
  onDone: () => void;
}) {
  const def = TRACES[shape];
  const strokes = useMemo(() => def.strokes.map((s) => resample(s)), [def]);
  const [stroke, setStroke] = useState(0);
  const [done, setDone] = useState(0);
  const [misses, setMisses] = useState(0);
  const moved = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  const finished = stroke >= strokes.length;
  const self = guide === 'start';
  const hint = self && misses >= HINT_AFTER;

  useEffect(() => {
    void ask(self ? traceSelfPrompt(shape) : tracePrompt(shape));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (finished) return;
    const points = strokes[stroke]!;
    // Без линии перед глазами — чуть щедрее к неровной руке.
    const reached = advance(points, done, svgPoint(svg.current!, e), self ? 12 : 9);
    if (reached === done) return;
    moved.current = true;
    if (reached >= points.length) {
      fx.snap();
      setStroke(stroke + 1);
      setDone(0);
      setMisses(0);
      if (stroke + 1 >= strokes.length) onDone();
    } else setDone(reached);
  };

  /** «Сама»: провела мимо — промах; после двух подсказываем линией этого штриха. */
  const lift = () => {
    if (!self || finished || moved.current) return;
    bump();
    if (misses + 1 === HINT_AFTER) void say(TRACE_HINT);
    setMisses(misses + 1);
  };

  const current = strokes[stroke];
  return (
    <div className="game tracing" data-testid="game-tracing" data-guide={guide}>
      <div className="trace-wrap">
        <svg
          ref={svg}
          viewBox="0 0 100 100"
          className="trace-svg"
          data-testid="trace"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            moved.current = false;
            move(e);
          }}
          onPointerMove={(e) => e.buttons && move(e)}
          onPointerUp={lift}
        >
          {def.letter && <Rules />}
          {guide === 'dots' &&
            strokes.map((pts, i) => (
              <g key={i}>
                <path d={toPath(pts)} className="trace-guide" />
                <path d={toPath(pts)} className="trace-dash" />
              </g>
            ))}
          {guide === 'line' &&
            strokes.map((pts, i) => <path key={i} d={toPath(pts)} className="trace-line" />)}
          {hint && current && (
            <path d={toPath(current)} className="trace-line" data-testid="trace-hint" />
          )}
          {def.letter && !self && <StrokeNumbers strokes={strokes} at={def.numbers} />}
          {strokes.slice(0, stroke).map((pts, i) => (
            <path key={i} d={toPath(pts)} className="trace-ink" />
          ))}
          {current && <path d={toPath(current.slice(0, done))} className="trace-ink" />}
          {current && def.letter && done === 0 && <Arrow points={current} />}
          {current && (
            <>
              <circle
                cx={current[Math.max(0, done - 1)]![0]}
                cy={current[Math.max(0, done - 1)]![1]}
                r={4.5}
                className="trace-start"
              />
              {(!self || hint) && (
                <circle
                  cx={current.at(-1)![0]}
                  cy={current.at(-1)![1]}
                  r={3}
                  className="trace-end"
                />
              )}
            </>
          )}
        </svg>
        {self && (
          <svg viewBox="0 0 100 100" className="trace-sample" data-testid="trace-sample">
            {def.letter && <Rules />}
            {strokes.map((pts, i) => (
              <path key={i} d={toPath(pts)} className="trace-sample-ink" />
            ))}
            {def.letter && <StrokeNumbers strokes={strokes} at={def.numbers} />}
          </svg>
        )}
      </div>
    </div>
  );
}
