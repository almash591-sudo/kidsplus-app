// Защита от белого экрана: любая ошибка в приложении — спокойный экран и перезагрузка через
// 10 секунд, а не пустая страница, из которой ребёнок не выйдет.
import { Component, type ReactNode } from 'react';

const RELOAD_MS = 10_000;

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('KidsPlus: ошибка приложения', error);
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
