import { useEffect, useRef, useState } from 'react';
import { kidApi } from '../api';
import { iosBrowserTab } from '../ios';

type Status = 'idle' | 'checking' | 'invalid' | 'error';

/**
 * Экран для взрослого: привязка телефона к профилю ребёнка.
 * Код приходит из QR-ссылки или вводится вручную (XXXX-XXXX).
 */
export function PairScreen({
  initialCode,
  onPaired,
}: {
  initialCode: string | null;
  onPaired: () => void;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  // iPhone, вкладка Safari: сначала — на экран «Домой», код вводится уже там (он одноразовый).
  const [install, setInstall] = useState(iosBrowserTab);
  const [status, setStatus] = useState<Status>(initialCode && !install ? 'checking' : 'idle');
  const tried = useRef(false);

  const submit = async (value: string) => {
    setStatus('checking');
    try {
      if (await kidApi.pair(value)) onPaired();
      else setStatus('invalid');
    } catch {
      setStatus('error');
    }
  };

  // По QR-ссылке привязываем сразу, без нажатий.
  useEffect(() => {
    if (initialCode && !install && !tried.current) {
      tried.current = true;
      void submit(initialCode);
    }
    // submit не меняет поведение между рендерами
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, install]);

  if (install) {
    return (
      <div className="screen center pair" data-testid="pair-install">
        <div className="pair-card">
          <h1>Сначала — на экран «Домой»</h1>
          <ol className="pair-steps">
            <li>
              Нажмите кнопку <b>«Поделиться»</b> внизу Safari.
            </li>
            <li>
              Выберите <b>«На экран „Домой“»</b> → <b>«Добавить»</b>.
            </li>
            <li>Откройте KidsPlus с иконки и введите код:</li>
          </ol>
          {initialCode && (
            <p className="pair-big-code" data-testid="pair-install-code">
              {initialCode}
            </p>
          )}
          <p className="pair-note">
            Код действует 10 минут. Не успели — получите новый в кабинете.
          </p>
          <button type="button" className="pair-link" onClick={() => setInstall(false)}>
            Продолжить в Safari
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen center pair" data-testid="pair">
      <div className="pair-card">
        <h1>Привязка телефона</h1>
        <p>
          Взрослому: в родительском кабинете откройте «Устройства» → «Привязать телефон» и
          отсканируйте QR-код камерой этого телефона. Или введите код:
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={9}
            aria-label="Код привязки"
            data-testid="pair-code"
          />
          <button
            type="submit"
            disabled={status === 'checking' || code.replace(/[^A-Z0-9]/gi, '').length !== 8}
          >
            {status === 'checking' ? 'Проверяем…' : 'Привязать'}
          </button>
        </form>
        {status === 'invalid' && (
          <p className="pair-error">Код неверный или истёк. Получите новый в кабинете.</p>
        )}
        {status === 'error' && (
          <p className="pair-error">Нет связи с сервером. Попробуйте ещё раз.</p>
        )}
      </div>
    </div>
  );
}
