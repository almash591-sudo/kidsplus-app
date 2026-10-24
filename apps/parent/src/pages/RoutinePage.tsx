// «Распорядок» (этап 33): «План», «Привычки», «Сон» одного ребёнка — как устроен его день.
// Этап 47: «Сейчас» и «Сегодня» (пульт, лента дня, журнал) переехали на вкладку «Пульт»; старые
// ссылки сюда (?listen=…, ?tab=day, без вкладки из push) ведут туда. Ребёнок — общий выбор кабинета.
import { SegmentedControl, Stack } from '@mantine/core';
import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { KidAvatar, kidColor } from '../components/KidBits';
import { setCurrentChild, useCurrentChild } from '../lib/currentChild';
import { useChildren } from '../queries';
import { HabitsPage } from './HabitsPage';
import { PlanPage } from './PlanPage';
import { SleepPage } from './SleepPage';

const TABS = [
  { value: 'plan', label: 'План' },
  { value: 'habits', label: 'Привычки' },
  { value: 'sleep', label: 'Сон' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export function RoutinePage() {
  const [params, setParams] = useSearchParams();
  const children = useChildren();
  const kids = children.data ?? [];
  const [childId] = useCurrentChild();
  const asked = params.get('tab');
  const tab = (TABS.some((t) => t.value === asked) ? asked : 'plan') as Tab;
  const open = (t: Tab) => setParams({ tab: t }, { replace: true });
  const linked = params.get('child');
  useEffect(() => {
    if (linked && children.data?.some((k) => k.id === linked)) setCurrentChild(linked);
  }, [linked, children.data]);

  // Старые push и ссылки этапа 40: «Распорядок» ребёнка с карточкой «Сейчас» — теперь его пульт.
  const listen = params.get('listen');
  if (listen) return <Navigate to={`/remote?listen=${listen}`} replace />;
  if (asked === 'day' || (linked && !asked))
    return <Navigate to={linked ? `/remote?child=${linked}` : '/remote'} replace />;

  return (
    <Stack gap="md">
      <h1 className="page-title">Распорядок</h1>
      {kids.length > 1 && (
        <div className="kid-switch sticky" role="tablist" aria-label="Ребёнок">
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={k.id === childId}
              className={k.id === childId ? 'on' : ''}
              onClick={() => setCurrentChild(k.id)}
            >
              <KidAvatar child={k} color={kidColor(kids, k.id)} size={26} />
              {k.nickname}
            </button>
          ))}
        </div>
      )}
      <SegmentedControl
        fullWidth
        value={tab}
        onChange={(v) => open(v as Tab)}
        data={TABS.map((t) => ({ value: t.value, label: t.label }))}
      />
      <div className="embedded-page">
        {tab === 'plan' && <PlanPage />}
        {tab === 'habits' && <HabitsPage />}
        {tab === 'sleep' && <SleepPage />}
      </div>
    </Stack>
  );
}
