import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
// Новый вид (этап 12б): шрифт Onest — файлы внутри приложения; тема в духе iOS.
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/800.css';
import './theme.css';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { queryClient } from './queries';
import { router } from './router';
import { registerServiceWorker } from '@kidsplus/shared/sw-register';

import { theme } from './theme';
import { installHaptics } from './components/Chrome';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-center" />
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <RouterProvider router={router} />
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);

registerServiceWorker();
// Лёгкий виброотклик на касания (этап 17б).
installHaptics();
