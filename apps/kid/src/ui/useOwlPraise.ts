import { useEffect, useState } from 'react';
import { playSequence } from '../audio';
import { fx } from '../fx';
import { ru } from '../games/common';
import { owlBus } from '../owl/bus';
import { OWL_PRAISE } from '../phrases';
import { vary } from '../variety';

/** Only menu companions consume praise; lesson/task screens leave it queued until return. */
export function useOwlPraise(enabled = true) {
  const [praise, setPraise] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let finish: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (document.hidden || !owlBus.take()) return;
      const phrase = vary('owl-praise', OWL_PRAISE.map(ru))!;
      setPraise(phrase.text);
      fx.success();
      void playSequence([phrase]);
      clearTimeout(finish);
      finish = setTimeout(() => setPraise(null), 3300);
    };
    // Let the returning menu mount and finish its short entrance first.
    let scheduled = setTimeout(start, 1200);
    const schedule = () => {
      clearTimeout(scheduled);
      scheduled = setTimeout(start, 300);
    };
    const unsubscribe = owlBus.subscribe(schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      clearTimeout(scheduled);
      clearTimeout(finish);
      unsubscribe();
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [enabled]);
  return praise;
}
