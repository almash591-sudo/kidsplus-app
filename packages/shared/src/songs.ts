// Песенки для игры «Сыграй песенку» (этап 18б): ребёнок нажимает светящиеся клавиши — и играет
// знакомую мелодию. Только народные и старинные мелодии (общественное достояние), в до мажоре
// в пределах одной октавы: n — клавиша (0 — до, 7 — до второй октавы), d — длительность в долях.

export interface SongNote {
  n: number;
  d: number;
}

export interface Song {
  title: string;
  /** Картинка-эмодзи над клавишами. */
  emoji: string;
  notes: SongNote[];
}

const q = (...keys: number[]): SongNote[] => keys.map((n) => ({ n, d: 1 }));
const h = (n: number): SongNote => ({ n, d: 2 });

export const SONGS = {
  vorobey: {
    title: 'Андрей-воробей',
    emoji: '🐦',
    notes: [...q(4, 2, 4, 2), ...q(4, 4), h(2), ...q(4, 2, 4, 2), ...q(4, 4), h(2)],
  },
  yakov: {
    title: 'Братец Яков',
    emoji: '🔔',
    notes: [...q(0, 1, 2, 0), ...q(0, 1, 2, 0), ...q(2, 3), h(4), ...q(2, 3), h(4)],
  },
  zvezdochka: {
    title: 'Мерцай, звёздочка',
    emoji: '⭐',
    notes: [...q(0, 0, 4, 4, 5, 5), h(4), ...q(3, 3, 2, 2, 1, 1), h(0)],
  },
  barashek: {
    title: 'У Мэри был барашек',
    emoji: '🐑',
    notes: [...q(2, 1, 0, 1, 2, 2), h(2), ...q(1, 1), h(1), ...q(2, 4), h(4)],
  },
  bubentsy: {
    title: 'Бубенцы',
    emoji: '🛷',
    notes: [...q(2, 2), h(2), ...q(2, 2), h(2), ...q(2, 4, 0, 1), { n: 2, d: 4 }],
  },
  radost: {
    title: 'Ода к радости',
    emoji: '🎺',
    notes: [...q(2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2), { n: 2, d: 1.5 }, { n: 1, d: 0.5 }, h(1)],
  },
  kolybelnaya: {
    title: 'Колыбельная',
    emoji: '🌙',
    notes: [...q(2, 2), h(4), ...q(2, 2), h(4), ...q(2, 4, 7, 6), h(5), ...q(4)],
  },
} satisfies Record<string, Song>;

export type SongId = keyof typeof SONGS;
export const SONG_IDS = Object.keys(SONGS) as [SongId, ...SongId[]];
