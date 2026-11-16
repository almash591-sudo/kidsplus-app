// Кому позвонить: большие портреты семьи. Касание — видеозвонок, трубка — только голос.
import type { Contact } from '@kidsplus/shared/calls';
import { useEffect, useState } from 'react';
import { API_PREFIX } from '@kidsplus/shared';
import { fx } from '../fx';
import { callEngine, startCalls } from './engine';
import './calls.css';
import { Icon } from '../ui/icons';
import { FairyHeader } from '../ui/FairyGuide';
import { ROOM_PHRASES } from '../phrases';

export const contactEmoji = (c: Pick<Contact, 'kind' | 'name'>) =>
  c.kind === 'child' ? '👧' : /пап|dad/i.test(c.name) ? '👨' : /баб/i.test(c.name) ? '👵' : '👩';

export function CallsScreen({ onExit }: { onExit: () => void }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [dialing, setDialing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_PREFIX}/calls/contacts`, { credentials: 'same-origin', signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Contacts unavailable');
        return r.json() as Promise<Contact[]>;
      })
      .then(
        (items) => {
          if (!controller.signal.aborted) setContacts(items);
        },
        () => {
          if (!controller.signal.aborted) setFailed(true);
        },
      );
    return () => controller.abort();
  }, [attempt]);

  const call = (to: Contact[], video: boolean) => {
    if (dialing) return;
    fx.pop();
    setDialing(true);
    setFailed(false);
    void (async () => {
      const engine = callEngine() ?? (await startCalls());
      if (!engine) throw new Error('Calls unavailable');
      await engine.start(
        to.map((c) => c.id),
        video,
      );
    })()
      .catch(() => setFailed(true))
      .finally(() => setDialing(false));
  };

  return (
    <div className="screen calls fairy-page fairy-calls" data-testid="calls">
      <FairyHeader
        title="Мои родные"
        picture="/playroom/phone.webp"
        hint={ROOM_PHRASES.calls}
        onBack={onExit}
        backTestId="go-home"
      />
      {failed && (
        <div className="fairy-family-notice" role="status">
          <p>Не получилось. Попробуем ещё?</p>
          <button
            type="button"
            className="fairy-back"
            aria-label="Попробовать ещё раз"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            <Icon name="retry" size={28} />
          </button>
        </div>
      )}
      {!contacts && !failed && (
        <p className="fairy-family-loading" role="status">
          Собираем семью…
        </p>
      )}
      {contacts && !contacts.length && !failed && (
        <div className="fairy-family-empty">
          <img src="/playroom/phone.webp" alt="" />
          <p>Здесь будут твои родные</p>
        </div>
      )}
      <div className="calls-grid">
        {contacts?.map((c) => (
          <div key={c.id} className="calls-contact">
            <button
              type="button"
              className="calls-face"
              data-testid="call-contact"
              data-peer={c.id}
              aria-label={`Видеозвонок: ${c.name}`}
              disabled={dialing}
              onClick={() => call([c], true)}
            >
              <span className="calls-emoji">{contactEmoji(c)}</span>
              <span className="calls-name">{c.name}</span>
              <span className="calls-video-mark" aria-hidden="true">
                <Icon name="video" size={22} />
              </span>
            </button>
            <button
              type="button"
              className="calls-voice"
              data-testid="call-voice"
              aria-label={`Звонок голосом: ${c.name}`}
              disabled={dialing}
              onClick={() => call([c], false)}
            >
              <Icon name="phone" size={26} />
              <span>Голосом</span>
            </button>
          </div>
        ))}
        {contacts && contacts.length > 1 && (
          <div className="calls-contact family">
            <button
              type="button"
              className="calls-face"
              data-testid="call-family"
              aria-label="Позвонить всей семьёй"
              disabled={dialing}
              onClick={() => call(contacts.slice(0, 3), true)}
            >
              <span className="calls-emoji">👨‍👩‍👧‍👧</span>
              <span className="calls-name">Все вместе</span>
              <span className="calls-video-mark" aria-hidden="true">
                <Icon name="video" size={22} />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CallsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="calls-open"
      aria-label="Позвонить"
      data-testid="calls-open"
      onClick={() => {
        fx.tap();
        onOpen();
      }}
    >
      <Icon name="phone" size={32} stroke={2} />
    </button>
  );
}
