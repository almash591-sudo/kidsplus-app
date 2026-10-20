// «Магазин» (этап 34): товар с ценником — положить на прилавок монетки ровно на эту сумму. Монетки
// по 1, а на уровнях выше ещё по 2 и по 5 — счёт и первые шаги в сложении. Монетку с прилавка
// можно убрать касанием.
import { useEffect, useRef, useState } from 'react';
import { SHOP_BUY, SHOP_TOO_MUCH, shopPrice } from '../phrases';
import { ask, nice, praise, retry, say, type GameProps } from './common';
import { Pic } from './DragItem';
import { burstAt } from './juice';

type Coin = 1 | 2 | 5;

/** Цена раунда (1…max) и товар. */
export function shopRound(spec: { max: number; imageIds: string[] }, rnd = Math.random) {
  return {
    price: 1 + Math.floor(rnd() * spec.max),
    image: spec.imageIds[Math.floor(rnd() * spec.imageIds.length)]!,
  };
}

export function Shop({ spec, phrases, onFinish }: GameProps<'shop'>) {
  // Монетка в 1 есть всегда — любую цену можно собрать.
  const coins = [...new Set<Coin>([1, ...(spec.coins as Coin[])])].sort((a, b) => a - b);
  const [round, setRound] = useState(0);
  const [r, setR] = useState(() => shopRound(spec));
  const [tray, setTray] = useState<Coin[]>([]);
  const [solved, setSolved] = useState(false);
  const tag = useRef<HTMLDivElement>(null);
  const sum = tray.reduce((a, c) => a + c, 0);

  useEffect(() => {
    void ask(shopPrice(r.price));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- задание звучит в начале раунда
  }, [round]);

  const put = (c: Coin, el: Element) => {
    if (solved) return;
    const next = [...tray, c];
    const total = sum + c;
    if (total > r.price) {
      setTray(next);
      void retry(phrases).then(() => say(SHOP_TOO_MUCH));
      setTimeout(() => setTray([]), 900);
      return;
    }
    nice(el);
    setTray(next);
    if (total === r.price) {
      setSolved(true);
      burstAt(tag.current, 20);
      void say(SHOP_BUY).then(() => praise(phrases));
      setTimeout(() => {
        if (round + 1 >= spec.rounds) return onFinish();
        setRound(round + 1);
        setR(shopRound(spec));
        setTray([]);
        setSolved(false);
      }, 2600);
    }
  };

  return (
    <div className="game shop" data-testid="game-shop" data-price={r.price} data-sum={sum}>
      <div className={solved ? 'shop-item bought' : 'shop-item'} ref={tag}>
        <span className="shop-pic">
          <Pic id={r.image} />
        </span>
        <span className="shop-tag" data-testid="shop-price">
          {r.price}
        </span>
      </div>
      <div className="shop-tray" data-testid="shop-tray">
        {tray.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`shop-coin c${c} small`}
            onClick={() => !solved && setTray(tray.filter((_, k) => k !== i))}
            aria-label={`Убрать монетку ${c}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="shop-purse">
        {coins.map((c) => (
          <button
            key={c}
            type="button"
            className={`shop-coin c${c}`}
            data-testid="shop-coin"
            data-value={c}
            onClick={(e) => put(c, e.currentTarget)}
            aria-label={`Монетка ${c}`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
