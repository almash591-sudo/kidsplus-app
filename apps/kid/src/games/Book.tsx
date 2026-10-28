import {
  bookAnnounce,
  bookOf,
  bookPicture,
  chapterAnnounce,
  type Book as BookData,
  type BookCode,
} from '@kidsplus/shared/books';
import { withoutStress } from '@kidsplus/shared/voice';
import { useEffect, useRef, useState } from 'react';
import { BOOK_END, BOOK_RESUME, BOOK_TOMORROW, BOOK_TURN } from '../phrases';
import { Icon } from '../ui/icons';
import { BookScene } from './BookScene';
import { chapterQuestions, markOf, saveMark, startOf, today } from './bookPlan';
import { gameReport, say, setTask, type GameProps } from './common';
import { pause, Questions, speak, useFitText, useScript } from './Poem';
import './poem.css';
import './book.css';

type Step = 'cover' | 'page' | 'questions' | 'end';

/** Обложка: название и автор; глава длинной книжки; с закладки — «продолжаем». */
function Cover(props: {
  code: BookCode;
  book: BookData;
  chapter: number;
  resume: boolean;
  onDone: () => void;
}) {
  const { book, chapter } = props;
  const head = chapterAnnounce(book, chapter);
  useScript(async (alive) => {
    const lines = [
      bookAnnounce(book),
      ...(head ? [head] : []),
      ...(props.resume ? [BOOK_RESUME] : []),
    ];
    setTask(() => say(...lines));
    await speak(...lines);
    if (!alive()) return;
    await pause(600);
    if (alive()) props.onDone();
  }, []);
  return (
    <>
      <BookScene code={props.code} scene={book.cover} />
      <div className="poem-text book-cover-text" data-testid="book-cover">
        <p className="book-title">{book.title}</p>
        {book.author && <p className="book-author">{book.author}</p>}
        {head && <p className="book-chapter">{head}</p>}
      </div>
      <NextButton onClick={props.onDone} />
    </>
  );
}

function NextButton({ onClick, ready = false }: { onClick: () => void; ready?: boolean }) {
  return (
    <button
      type="button"
      className={ready ? 'poem-next book-next ready' : 'poem-next book-next'}
      aria-label="Дальше"
      data-testid="book-next"
      data-hint={ready ? '' : undefined}
      onClick={onClick}
    >
      <Icon name="next" size={40} stroke={2.8} />
    </button>
  );
}

/**
 * Страница: сцена и 1–3 предложения. Голос читает их по одному и подсвечивает то, что звучит;
 * нажал на предложение — прочитает его ещё раз. Дочитал — сам листает (autoTurn) или ждёт стрелку.
 */
function Page(props: {
  code: BookCode;
  book: BookData;
  chapter: number;
  page: number;
  autoTurn: boolean;
  onNext: () => void;
  onPrev: (() => void) | null;
}) {
  const { book, chapter, page } = props;
  const pages = book.chapters[chapter]!.pages;
  const p = pages[page]!;
  const [now, setNow] = useState(-1);
  const [ready, setReady] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  useFitText(textRef, `${chapter}:${page}`);

  // Следующая сцена — заранее: страница перевернётся без белого мига.
  useEffect(() => {
    const next = pages[page + 1]?.picture;
    if (book.drawn && next && next !== p.picture) new Image().src = bookPicture(next);
  }, [book, pages, page, p.picture]);

  useScript(async (alive) => {
    setTask(() => say(...p.text));
    for (let k = 0; k < p.text.length; k++) {
      if (!alive()) return;
      setNow(k);
      await speak(p.text[k]!);
    }
    if (!alive()) return;
    setNow(-1);
    if (props.autoTurn) {
      await pause(1200);
      if (alive()) props.onNext();
      return;
    }
    setReady(true);
    setTask(() => say(BOOK_TURN));
  }, []);

  // Одна сцена на несколько страниц — камера наезжает с другой стороны.
  const same = pages.slice(0, page).filter((x) => x.picture === p.picture).length;
  return (
    <>
      <BookScene code={props.code} scene={p.picture} pan={same} />
      <div ref={textRef} className="poem-text book-text" data-testid="book-text">
        <p>
          {p.text.map((t, k) => (
            <span
              key={k}
              className={k === now ? 'book-line now' : 'book-line'}
              data-testid={k === now ? 'book-line-now' : 'book-line'}
              onClick={() => {
                setNow(k);
                void say(t).then(() => setNow((n) => (n === k ? -1 : n)));
              }}
            >
              {withoutStress(t)}{' '}
            </span>
          ))}
        </p>
      </div>
      {props.onPrev && (
        <button
          type="button"
          className="book-prev"
          aria-label="Назад"
          data-testid="book-prev"
          onClick={props.onPrev}
        >
          <Icon name="prev" size={30} stroke={2.8} />
        </button>
      )}
      <NextButton onClick={props.onNext} ready={ready} />
      <span className="book-pageno" aria-hidden="true">
        {page + 1} / {pages.length}
      </span>
    </>
  );
}

/** Конец главы или книжки. */
function End(props: { code: BookCode; book: BookData; more: boolean; onDone: () => void }) {
  const text = props.more ? BOOK_TOMORROW : BOOK_END[props.book.genre];
  useScript(async (alive) => {
    setTask(() => say(text));
    await speak(text);
    if (!alive()) return;
    await pause(500);
    if (alive()) props.onDone();
  }, []);
  return (
    <>
      <BookScene code={props.code} scene={props.book.cover} />
      <div className="poem-text" data-testid="book-end">
        <p>{text}</p>
      </div>
    </>
  );
}

/**
 * Книжка (этап 52): обложка, страницы под голос, вопросы в конце главы. Длинная — по главе
 * в день; закладку телефон помнит: открыл снова — продолжаем с той же страницы.
 */
export function Book({ spec, phrases, onFinish }: GameProps<'book'>) {
  const code = spec.book;
  const book = bookOf(code);
  const [start] = useState(() => startOf(book, markOf(code)));
  const { chapter } = start;
  const [step, setStep] = useState<Step>('cover');
  const [page, setPage] = useState(start.page);
  const [rounds] = useState(() =>
    spec.questions ? chapterQuestions(code, chapter, spec.choices) : [],
  );
  const pages = book.chapters[chapter]!.pages;
  const more = chapter + 1 < book.chapters.length;

  // Закладка — на каждой странице: ушёл посреди — вернётся сюда же.
  useEffect(() => {
    if (step === 'page') saveMark(code, { chapter, page });
  }, [code, chapter, page, step]);

  const endChapter = () => {
    saveMark(code, { chapter, page: 0, day: today() });
    setStep(rounds.length ? 'questions' : 'end');
  };
  const finish = () => {
    gameReport.set({ book: code, chapter: chapter + 1, chapters: book.chapters.length });
    onFinish();
  };

  return (
    <div
      className={`game poem book ${step}`}
      data-testid="game-book"
      data-book={code}
      data-step={step}
      data-chapter={chapter}
      data-page={page}
      // Голос читает — ребёнок слушает; подсказка «нажми» — только когда страница дочитана.
      data-no-idle={step === 'cover' || step === 'end' || spec.autoTurn || undefined}
      key={step === 'page' ? `page-${page}` : step}
    >
      {step === 'cover' && (
        <Cover
          code={code}
          book={book}
          chapter={chapter}
          resume={start.page > 0}
          onDone={() => setStep('page')}
        />
      )}
      {step === 'page' && (
        <Page
          code={code}
          book={book}
          chapter={chapter}
          page={page}
          autoTurn={spec.autoTurn}
          onNext={() => (page + 1 < pages.length ? setPage(page + 1) : endChapter())}
          onPrev={page > 0 ? () => setPage(page - 1) : null}
        />
      )}
      {step === 'questions' && (
        <Questions rounds={rounds} phrases={phrases} onDone={() => setStep('end')} />
      )}
      {step === 'end' && <End code={code} book={book} more={more} onDone={finish} />}
    </div>
  );
}
