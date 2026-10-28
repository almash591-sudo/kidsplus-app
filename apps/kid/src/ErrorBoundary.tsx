// Защита от белого экрана: любая ошибка в приложении — спокойный экран и перезагрузка через
// 10 секунд, а не пустая страница, из которой ребёнок не выйдет.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorText, reportError } from './errors';

const RELOAD_MS = 10_000;

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('KidsPlus: ошибка приложения', error);
    // Этап 51: что упало и в каком компоненте — родителю в «Устройства».
    const { stack } = errorText(error);
    reportError('screen', error, [stack, info.componentStack].filter(Boolean).join('\n'));
    this.timer ??= setTimeout(() => window.location.reload(), RELOAD_MS);
  }

  override componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="screen center" data-testid="app-error">
        <button
          type="button"
          className="big-button"
          aria-label="Повторить"
          onClick={() => window.location.reload()}
        >
          ↻
        </button>
      </div>
    );
  }
}
