import { useEffect, useMemo, useRef, useState } from 'react';
import { fx } from '../fx';
import { ask, praise, svgPoint, type GameProps } from './common';
import { tracePrompt } from '../phrases';
import { advance, resample, TRACES } from './traceShapes';

const toPath = (pts: readonly (readonly [number, number])[]) =>
  pts.length ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}` : '';

/** Обведи по точкам: ведём пальцем от зелёной точки по пунктиру; штрихи — по очереди. */
export function Tracing({ spec, phrases, onFinish }: GameProps<'tracing'>) {
  const [index, setIndex] = useState(0);
  const shape = spec.shapes[index]!;
  return (
    <TraceOne
      key={index}
      shape={shape}
      onDone={() => {
        void praise(phrases);
        setTimeout(() => {
          if (index + 1 < spec.shapes.length) setIndex(index + 1);
          else onFinish();
        }, 1300);
      }}
    />
  );
}

function TraceOne({ shape, onDone }: { shape: keyof typeof TRACES; onDone: () => void }) {
  const def = TRACES[shape];
  const strokes = useMemo(() => def.strokes.map((s) => resample(s)), [def]);
  const [stroke, setStroke] = useState(0);
  const [done, setDone] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const finished = stroke >= strokes.length;
  const prompt = () => ask(tracePrompt(shape));

  useEffect(() => {
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит один раз при показе
  }, []);

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (finished) return;
    const points = strokes[stroke]!;
    const reached = advance(points, done, svgPoint(svg.current!, e));
    if (reached === done) return;
    if (reached >= points.length) {
      fx.snap();
      setStroke(stroke + 1);
      setDone(0);
      if (stroke + 1 >= strokes.length) onDone();
    } else setDone(reached);
  };

  const current = strokes[stroke];
  return (
    <div className="game tracing" data-testid="game-tracing">
      <svg
        ref={svg}
        viewBox="0 0 100 100"
        className="trace-svg"
        data-testid="trace"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.buttons && move(e)}
      >
        {strokes.map((pts, i) => (
          <g key={i}>
            <path d={toPath(pts)} className="trace-guide" />
            <path d={toPath(pts)} className="trace-dash" />
          </g>
        ))}
        {strokes.slice(0, stroke).map((pts, i) => (
          <path key={i} d={toPath(pts)} className="trace-ink" />
        ))}
        {current && <path d={toPath(current.slice(0, done))} className="trace-ink" />}
        {current && (
          <>
            <circle
              cx={current[Math.max(0, done - 1)]![0]}
              cy={current[Math.max(0, done - 1)]![1]}
              r={4.5}
              className="trace-start"
            />
            <circle cx={current.at(-1)![0]} cy={current.at(-1)![1]} r={3} className="trace-end" />
          </>
        )}
      </svg>
    </div>
  );
}
