import type { KidPhrases, QuizSettings } from '@kidsplus/shared/api';
import { poemOf } from '@kidsplus/shared/poems';
import { useRef, useState } from 'react';
import { Celebrate } from '../Celebrate';
import { fx } from '../fx';
import { ru } from '../games/common';
import { backdropOf } from '../games/GameScreen';
import { Blanks, Questions, speak, useScript, type ChoiceWatch } from '../games/Poem';
import { REVIEW_DONE, reviewAsk, type Gender } from '../phrases';
import { QuizScreen, type QuizSource } from '../quiz/QuizScreen';
import { REVIEW_TASKS, type Review } from '../review';
import { Icon } from '../ui/icons';

/** Пункт с заданиями (не игра «посложнее»). */
export type Check = Extract<NonNullable<Review>, { kind: 'quiz' | 'poem' | 'book' }>;

/**
 * Повтор пройденного (этап 55): совёнок говорит «Ты это уже прошла! Если интересно ещё раз —
 * выполни пять заданий», дальше пять заданий по теме. Ошибся — вариант гаснет, можно снова.
 * В конце — праздник и onPass с числом ошибок: пункт открывается. «Домой» — без последствий.
 */
export function ReviewScreen(props: {
  review: Check;
  source: QuizSource;
  settings: QuizSettings;
  phrases: KidPhrases;
  gender: Gender;
  onPass: (mistakes: number) => void;
  onExit: () => void;
}) {
  const { review } = props;
  const mistakes = useRef(0);
  if (review.kind === 'quiz')
    return (
      <div data-testid="review" data-review="quiz" style={{ display: 'contents' }}>
        <QuizScreen
          source={props.source}
          questions={review.questions}
          settings={props.settings}
          count={REVIEW_TASKS}
          phrases={props.phrases}
          intro={ru(reviewAsk(props.gender))}
          review={{ onWrong: () => mistakes.current++, done: ru(REVIEW_DONE) }}
          onDone={() => props.onPass(mistakes.current)}
          onExit={props.onExit}
        />
      </div>
    );
  return <ChoiceReview {...props} review={review} />;
}

/** Стих или книжка: «Договори словечко» и вопросы с картинками — как в самом занятии. */
function ChoiceReview(props: {
  review: Extract<Check, { kind: 'poem' | 'book' }>;
  phrases: KidPhrases;
  gender: Gender;
  onPass: (mistakes: number) => void;
  onExit: () => void;
}) {
  const { review, phrases } = props;
  const poem = review.kind === 'poem' ? poemOf(review.poem) : null;
  const blanks = review.kind === 'poem' ? review.blanks : [];
  const [step, setStep] = useState<'intro' | 'blanks' | 'questions' | 'done'>('intro');
  const [solved, setSolved] = useState(0);
  const mistakes = useRef(0);
  const watch: ChoiceWatch = {
    onWrong: () => mistakes.current++,
    onSolved: () => setSolved((n) => n + 1),
  };
  const total = blanks.length + review.questions.length;
  const afterBlanks = () => setStep(review.questions.length ? 'questions' : 'done');

  useScript(async (alive) => {
    await speak(reviewAsk(props.gender));
    if (alive()) setStep(blanks.length ? 'blanks' : 'questions');
  }, []);

  return (
    <div className="game-screen" data-bg={backdropOf(review.kind)}>
      <div
        className={`game poem review ${step === 'intro' ? 'questions' : step}`}
        data-testid="review"
        data-review={review.kind}
        data-step={step}
      >
        {step === 'intro' && (
          <div className="poem-row ask">
            <span className="poem-owl">
              <img src="/owl/talk.webp" alt="" draggable={false} />
            </span>
            <div className="poem-text" data-testid="poem-text">
              <p>{reviewAsk(props.gender)}</p>
            </div>
          </div>
        )}
        {step === 'blanks' && poem && (
          <Blanks
            poem={poem}
            rounds={blanks}
            phrases={phrases}
            watch={watch}
            onDone={afterBlanks}
          />
        )}
        {step === 'questions' && (
          <Questions
            rounds={review.questions}
            phrases={phrases}
            watch={watch}
            onDone={() => setStep('done')}
          />
        )}
      </div>
      {step === 'done' && (
        <Celebrate
          testId="review-done"
          say={ru(REVIEW_DONE)}
          onDone={() => props.onPass(mistakes.current)}
        />
      )}
      {step !== 'done' && (
        <div className="quiz-progress" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < solved ? 'star on' : 'star'}>
              ★
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={() => {
          fx.whoosh();
          props.onExit();
        }}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
    </div>
  );
}
