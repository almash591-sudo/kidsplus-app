// Кому позвонить: большие портреты семьи. Касание — видеозвонок, трубка — только голос.
import type { Contact } from '@kidsplus/shared/calls';
import { useEffect, useState } from 'react';
import { API_PREFIX } from '@kidsplus/shared';
import { fx } from '../fx';
import { callEngine } from './engine';
import './calls.css';
import { Icon } from '../ui/icons';

export const contactEmoji = (c: Pick<Contact, 'kind' | 'name'>) =>
  c.kind === 'child' ? '👧' : /пап|dad/i.test(c.name) ? '👨' : /баб/i.test(c.name) ? '👵' : '👩';

export function CallsScreen({ onExit }: { onExit: () => void }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  useEffect(() => {
    fetch(`${API_PREFIX}/calls/contacts`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setContacts, () => setContacts([]));
  }, []);

  const call = (to: Contact[], video: boolean) => {
    fx.pop();
    void callEngine()?.start(
      to.map((c) => c.id),
      video,
    );
  };

  return (
    <div className="screen calls" data-testid="calls">
      <div className="calls-grid">
        {contacts?.map((c) => (
          <div key={c.id} className="calls-contact">
            <button
              type="button"
              className="calls-face"
              data-testid="call-contact"
              data-peer={c.id}
              aria-label={`Видеозвонок: ${c.name}`}
              onClick={() => call([c], true)}
            >
              <span className="calls-emoji">{contactEmoji(c)}</span>
              <span className="calls-name">{c.name}</span>
            </button>
            <button
              type="button"
              className="calls-voice"
              data-testid="call-voice"
              aria-label={`Звонок голосом: ${c.name}`}
              onClick={() => call([c], false)}
            >
              📞
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
              onClick={() => call(contacts.slice(0, 3), true)}
            >
              <span className="calls-emoji">👨‍👩‍👧‍👧</span>
              <span className="calls-name">Все</span>
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="corner-button home"
        aria-label="Домой"
        onClick={onExit}
        data-testid="go-home"
      >
        <Icon name="home" size={34} stroke={2.6} />
      </button>
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
