import { useSyncExternalStore } from 'react';
import { mascotStore } from './juice';

/**
 * Совёнок в углу экрана игры: моргает, радуется верному ответу, «ой» — при ошибке.
 * Только картинка: касания проходят сквозь него.
 */
export function Mascot() {
  const { mood, seq } = useSyncExternalStore(mascotStore.subscribe, mascotStore.get);
  const happy = mood === 'happy' || mood === 'wow';
  return (
    <div className={`mascot ${mood}`} key={seq} aria-hidden="true" data-mood={mood}>
      <svg viewBox="0 0 100 100">
        {/* Ушки-пёрышки */}
        <path d="M24,30 L18,8 L38,22 Z" fill="#B45309" />
        <path d="M76,30 L82,8 L62,22 Z" fill="#B45309" />
        {/* Тело и животик */}
        <ellipse cx="50" cy="58" rx="34" ry="38" fill="#D97706" />
        <ellipse cx="50" cy="70" rx="22" ry="22" fill="#FDE7C2" />
        <path
          d="M42,66 q4,4 8,0 M50,74 q4,4 8,0 M38,76 q4,4 8,0"
          stroke="#E9C48F"
          strokeWidth="2"
          fill="none"
        />
        {/* Крылышки */}
        <g className="mascot-wing left">
          <ellipse cx="18" cy="62" rx="9" ry="20" fill="#B45309" />
        </g>
        <g className="mascot-wing right">
          <ellipse cx="82" cy="62" rx="9" ry="20" fill="#B45309" />
        </g>
        {/* Глаза */}
        <circle cx="36" cy="42" r="14" fill="#fff" />
        <circle cx="64" cy="42" r="14" fill="#fff" />
        {happy ? (
          <g stroke="#3a2a14" strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M28,45 q8,-10 16,0" />
            <path d="M56,45 q8,-10 16,0" />
          </g>
        ) : (
          <g className="mascot-eyes" fill="#3a2a14">
            <circle cx={mood === 'oops' ? 32 : 38} cy="43" r="6" />
            <circle cx={mood === 'oops' ? 60 : 66} cy="43" r="6" />
            <circle cx={mood === 'oops' ? 34 : 40} cy="41" r="2" fill="#fff" />
            <circle cx={mood === 'oops' ? 62 : 68} cy="41" r="2" fill="#fff" />
          </g>
        )}
        {/* Клюв */}
        <path d={happy ? 'M44,54 L56,54 L50,64 Z' : 'M45,54 L55,54 L50,62 Z'} fill="#F59E0B" />
        {/* Щёчки */}
        {happy && (
          <>
            <circle cx="24" cy="56" r="5" fill="#F472B6" opacity="0.6" />
            <circle cx="76" cy="56" r="5" fill="#F472B6" opacity="0.6" />
          </>
        )}
        {/* Лапки */}
        <path
          d="M38,95 l-4,4 M38,95 l0,5 M38,95 l4,4 M62,95 l-4,4 M62,95 l0,5 M62,95 l4,4"
          stroke="#F59E0B"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
