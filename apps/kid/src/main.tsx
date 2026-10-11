import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerServiceWorker } from '@kidsplus/shared/sw-register';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { installTapFeedback } from './fx';
import { dropServiceWorker, inAndroidWebView } from './kiosk';
import './styles.css';
import './motion.css';
// Новый вид (этап 12): шрифт Nunito — файлы внутри приложения (правила безопасности не пускают Google Fonts).
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './theme.css';

installTapFeedback();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

if (inAndroidWebView()) {
  // В киоске страница должна идти через саму оболочку — она подключает связь с телефоном
  // (настройки, VPN). Service worker отдавал бы её из кэша мимо оболочки: убираем его.
  void dropServiceWorker();
} else {
  // Обновление не прерывает видео, квиз и карточки: перезагрузка — только на главном экране.
  registerServiceWorker(
    () =>
      !document.querySelector(
        '[data-testid=player], [data-testid=quiz], [data-testid=deck], [data-testid=game]',
      ),
  );
}
