import { mediaUrl } from '@kidsplus/shared/api';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fx } from '../fx';
import { GAME_INTRO } from '../phrases';
import { CachedImg } from '../ui/CachedImg';
import { Icon } from '../ui/icons';
import { ask, gameLock, nice, praise, retry, say, shuffled, type GameProps } from './common';
import { Pic } from './DragItem';
import { cheer, mascotStore } from './juice';
import { inside, useDrag, type DragState } from './useDrag';

/** A native button supports dragging and the simpler picture → basket gesture. */
function SortingPiece({
  id,
  index,
  hint,
  selected,
  disabled,
  onChoose,
  onDrop,
}: {
  id: string;
  index: number;
  hint: boolean;
  selected: boolean;
  disabled: boolean;
  onChoose: () => void;
  onDrop: (point: { x: number; y: number }) => boolean;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [back, setBack] = useState(false);
  const suppressClick = useRef(false);
  useEffect(() => {
    if (!back) return;
    const timer = setTimeout(() => setBack(false), 450);
    return () => clearTimeout(timer);
  }, [back]);
  const handlers = useDrag({
    onStart: () => {
      suppressClick.current = false;
      setDrag({ dx: 0, dy: 0 });
      fx.soft();
    },
    onMove: setDrag,
    onDrop: (point, offset) => {
      setDrag(null);
      // Pointer cancellation is neither a choice nor a wrong answer.
      suppressClick.current = !Number.isFinite(point.x) || Math.hypot(offset.dx, offset.dy) >= 10;
      if (suppressClick.current && Number.isFinite(point.x) && !onDrop(point)) setBack(true);
    },
  });
  return (
    <button
      type="button"
      className={`sorting-piece drag-item${selected ? ' is-selected' : ''}${drag ? ' dragging' : ''}${back ? ' bounced-back' : ''}`}
      data-testid="item"
      data-hint={hint ? '' : undefined}
      aria-label={`Выбрать картинку ${index + 1}`}
      aria-pressed={selected}
      disabled={disabled}
      style={{
        transform: drag
          ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.12) rotate(${Math.max(-8, Math.min(8, drag.dx / 16))}deg)`
          : undefined,
      }}
      {...handlers}
      onPointerDown={(event) => {
        if (event.button === 0 && !disabled) handlers.onPointerDown(event);
      }}
      onClick={(event) => {
        if (event.detail === 0 || !suppressClick.current) onChoose();
        suppressClick.current = false;
      }}
    >
      <Pic id={id} />
      {selected && (
        <span className="sorting-choice" aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
      )}
    </button>
  );
}

/** Assignments retain their images, answers and rewards; only the play surface changes. */
export function Sorting({ spec, phrases, onFinish }: GameProps<'sorting'>) {
  const [items] = useState(() => shuffled(spec.items.map((item, key) => ({ ...item, key }))));
  const [placed, setPlaced] = useState<Record<number, number>>({});
  const placedRef = useRef<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [got, setGot] = useState<{ bin: number; n: number } | null>(null);
  const [wrong, setWrong] = useState<{ bin: number; n: number } | null>(null);
  const bins = useRef<(HTMLButtonElement | null)[]>([]);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finished = useRef(false);
  const active = useRef(true);
  const { mood } = useSyncExternalStore(mascotStore.subscribe, mascotStore.get);
  const happy = mood === 'happy' || mood === 'wow';
  const left = items.filter((item) => placed[item.key] === undefined);
  // Refill six large spaces; never shrink twelve pictures into tiny targets.
  const visible = left.slice(0, 6);
  const count = items.length - left.length;
  const hint = left.find((item) => item.key === selected) ?? visible[0];

  useEffect(() => {
    void ask(spec.prompt);
  }, [spec.prompt]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      clearTimeout(finishTimer.current);
    };
  }, []);

  const place = (key: number, bin: number) => {
    if (finished.current || !active.current || gameLock.get() !== 'none') return false;
    if (placedRef.current[key] !== undefined) return false;
    const item = items.find((item) => item.key === key);
    if (!item) return false;
    if (item.bin !== bin) {
      setWrong((previous) => ({ bin, n: (previous?.n ?? 0) + 1 }));
      void retry(phrases);
      return false;
    }
    const next = { ...placedRef.current, [key]: bin };
    placedRef.current = next;
    setPlaced(next);
    setSelected(null);
    setWrong(null);
    setGot((previous) => ({ bin, n: (previous?.n ?? 0) + 1 }));
    nice(bins.current[bin]);
    cheer('happy');
    const total = Object.keys(next).length;
    if (total === items.length) {
      finished.current = true;
      void praise(phrases);
      finishTimer.current = setTimeout(() => {
        if (active.current) onFinish();
      }, 1200);
    } else if (total % 2 === 0) void praise(phrases);
    return true;
  };

  return (
    <div
      className="game sorting fairy-sorting"
      data-testid="game-sorting"
      data-ready={selected !== null ? '' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelected(null);
      }}
    >
      <header className="sorting-heading">
        <img src="/games/icon-sorting.webp" alt="" draggable={false} />
        <h1>По местам</h1>
      </header>
      <button
        type="button"
        className={`sorting-guide${happy ? ' is-happy' : ''}`}
        data-testid="ear"
        aria-label="Совёнок: повторить задание"
        onClick={() => {
          fx.soft();
          void say(spec.prompt, GAME_INTRO.sorting);
        }}
      >
        <span className="sorting-owl" aria-hidden="true">
          <img src={`/playroom/${happy ? 'owl-wave' : 'owl'}.webp`} alt="" draggable={false} />
          <img
            className="sorting-owl-blink"
            src="/playroom/owl-blink.webp"
            alt=""
            draggable={false}
          />
        </span>
        <span className="sorting-guide-content">
          <span className="sorting-prompt">
            {count === items.length ? 'Все на месте!' : spec.prompt}
          </span>
          <span className="sorting-caption">
            {count === items.length
              ? 'Получилось!'
              : selected !== null
                ? 'А теперь — в корзинку'
                : 'Выбери картинку'}
          </span>
        </span>
        <Icon name="ear" size={24} />
      </button>
      <div className="sorting-homes" style={{ '--homes': spec.bins.length } as React.CSSProperties}>
        {spec.bins.map((bin, index) => {
          const collected = items.filter((item) => placed[item.key] === index);
          const complete =
            collected.length > 0 &&
            collected.length === items.filter((item) => item.bin === index).length;
          return (
            <button
              key={index}
              type="button"
              ref={(el) => {
                bins.current[index] = el;
              }}
              className={`sorting-home${complete ? ' is-complete' : ''}`}
              data-testid="bin"
              data-hint-target={hint?.bin === index ? '' : undefined}
              aria-label={`${bin.name}. В корзинке ${collected.length}`}
              disabled={count === items.length}
              onClick={() => {
                if (selected !== null) place(selected, index);
                else void say(bin.name);
              }}
            >
              <CachedImg
                key={`${index}-${got?.bin === index ? got.n : 0}-${wrong?.bin === index ? wrong.n : 0}`}
                className={`sorting-home-portrait${got?.bin === index ? ' is-got' : ''}${wrong?.bin === index ? ' is-wrong' : ''}`}
                src={mediaUrl(bin.imageId)}
                alt=""
                draggable={false}
              />
              <span className="sorting-basket-scene" aria-hidden="true">
                <img className="sorting-basket" src="/games/basket.webp" alt="" draggable={false} />
                <span className="sorting-collected">
                  {collected.slice(-3).map((item) => (
                    <Pic key={item.key} id={item.imageId} />
                  ))}
                </span>
              </span>
              {complete && (
                <span className="sorting-home-check" aria-hidden="true">
                  <Icon name="check" size={19} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="sorting-shelf">
        <div
          className="sorting-progress"
          role="progressbar"
          aria-label="Разложено картинок"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={count}
        >
          {items.map((item, index) => (
            <img
              key={item.key}
              className={index < count ? 'is-earned' : ''}
              src="/games/robot-star.webp"
              alt=""
              draggable={false}
            />
          ))}
        </div>
        <div className="sorting-pieces">
          {visible.map((item, index) => (
            <SortingPiece
              key={item.key}
              id={item.imageId}
              index={index}
              hint={hint?.key === item.key}
              selected={selected === item.key}
              disabled={count === items.length}
              onChoose={() => {
                if (finished.current || gameLock.get() !== 'none') return;
                setSelected((current) => (current === item.key ? null : item.key));
                fx.soft();
              }}
              onDrop={(point) => {
                const hit = bins.current.findIndex((bin) => inside(bin, point));
                return hit >= 0 && place(item.key, hit);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
