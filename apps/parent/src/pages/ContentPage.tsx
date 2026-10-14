// «Контент» (Кабинет 2.0): видео, карточки, игры, аудио и проверка видео — в одном месте.
// Часть 1 — общая вкладка с переключателем; внутри пока прежние страницы (часть 2 их переделает).
import { SegmentedControl, Stack } from '@mantine/core';
import { useSearchParams } from 'react-router';
import { useMe } from '../queries';
import { AudioPage } from './AudioPage';
import { DecksPage } from './DecksPage';
import { GamesPage } from './GamesPage';
import { ReviewTab } from './ReviewTab';
import { VideosPage } from './VideosPage';

const TABS = [
  { value: 'review', label: 'Проверка' },
  { value: 'videos', label: 'Видео' },
  { value: 'decks', label: 'Карточки' },
  { value: 'games', label: 'Игры' },
  { value: 'audio', label: 'Аудио' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function ContentPage() {
  const [params, setParams] = useSearchParams();
  // Проверку видео (модерацию) ведёт только семья-администратор (этап 23).
  const admin = useMe().data?.isAdmin === true;
  const tabs = admin ? TABS : TABS.filter((t) => t.value !== 'review');
  const tab = (
    tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : tabs[0]!.value
  ) as Tab;
  return (
    <Stack gap="md">
      <h1 className="page-title">Контент</h1>
      <SegmentedControl
        fullWidth
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        data={tabs.map((t) => ({ value: t.value, label: t.label }))}
      />
      <div className="embedded-page">
        {tab === 'review' && <ReviewTab />}
        {tab === 'videos' && <VideosPage />}
        {tab === 'decks' && <DecksPage />}
        {tab === 'games' && <GamesPage />}
        {tab === 'audio' && <AudioPage />}
      </div>
    </Stack>
  );
}
