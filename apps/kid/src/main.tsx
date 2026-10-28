import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerServiceWorker } from '@kidsplus/shared/sw-register';
import { App } from './App';
import { CalledLayer } from './screens/RestScreen';
import { HabitLayer } from './screens/HabitsScreen';
import { BedtimeLayer } from './screens/NightScreen';
import { Sky } from './ui/Sky';
import { ErrorBoundary } from './ErrorBoundary';
import { installTapFeedback } from './fx';
import { unlockAudio } from './audio';
import { startOutbox } from './offline';
import { startErrorReports } from './errors';
import { dropServiceWorker, inAndroidWebView } from './kiosk';
import './styles.css';
import './motion.css';
// Новый вид (этап 12): шрифт Nunito — файлы внутри приложения (правила безопасности не пускают Google Fonts).
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './theme.css';
import './wow.css';

// Сбои — на сервер, родителю в «Устройства» (этап 51).
startErrorReports();
installTapFeedback();
// iPhone: звук и голос разрешены только после касания — первое касание их «будит».
addEventListener('pointerdown', unlockAudio, { capture: true, once: true });
// События прогресса, накопленные без сети, — на сервер, когда связь появится.
startOutbox();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Sky />
      <App />
      <CalledLayer />
      <HabitLayer />
      <BedtimeLayer />
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
