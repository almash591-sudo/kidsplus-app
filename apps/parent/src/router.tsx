import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './Layout';
import { AccountPage } from './pages/AccountPage';
import { AuthFormPage } from './pages/AuthFormPage';
import { ChildrenPage } from './pages/ChildrenPage';
import { DeckPage, DecksPage } from './pages/DecksPage';
import { DevicesPage } from './pages/DevicesPage';
import { GamesPage } from './pages/GamesPage';
import { LoginPage } from './pages/LoginPage';
import { ModerationItemPage } from './pages/ModerationItemPage';
import { ModerationPage } from './pages/ModerationPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CapturesPage } from './pages/CapturesPage';
import { ContentPage } from './pages/ContentPage';
import { HomePage } from './pages/HomePage';
import { MorePage } from './pages/MorePage';
import { CallsPage } from './pages/CallsPage';
import { NowPage } from './pages/NowPage';
import { PlanPage } from './pages/PlanPage';
import { SegmentEditorPage } from './pages/SegmentEditorPage';
import { VideosPage } from './pages/VideosPage';
import { VoicePage } from './pages/VoicePage';
import { VoicesPage } from './pages/VoicesPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/setup', element: <AuthFormPage mode="setup" /> },
  { path: '/invite', element: <AuthFormPage mode="invite" /> },
  // Проверка синтеза речи на телефоне ребёнка — без входа, данных не показывает.
  { path: '/voices', element: <VoicesPage /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: 'home', element: <HomePage /> },
      { path: 'content', element: <ContentPage /> },
      { path: 'progress', element: <AnalyticsPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'voice', element: <VoicePage /> },
      { path: 'now', element: <NowPage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'captures', element: <CapturesPage /> },
      { path: 'calls', element: <CallsPage /> },
      // Из push о звонке: экран звонка откроется поверх.
      { path: 'call/:id', element: <CallsPage /> },
      { path: 'moderation', element: <ModerationPage /> },
      { path: 'moderation/:id', element: <ModerationItemPage /> },
      { path: 'videos', element: <VideosPage /> },
      { path: 'videos/new', element: <SegmentEditorPage /> },
      { path: 'videos/:id', element: <SegmentEditorPage /> },
      { path: 'decks', element: <DecksPage /> },
      { path: 'decks/:id', element: <DeckPage /> },
      { path: 'games', element: <GamesPage /> },
      { path: 'children', element: <ChildrenPage /> },
      { path: 'devices', element: <DevicesPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: '*', element: <Navigate to="/home" replace /> },
    ],
  },
]);
