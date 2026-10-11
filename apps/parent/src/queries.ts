import type {
  Child,
  ChildItem,
  Deck,
  Device,
  Game,
  ParentMe,
  Question,
  Segment,
} from '@kidsplus/shared/api';
import type { ChildAnalytics, WeeklyReport } from '@kidsplus/shared/analytics';
import type { ChildNow, Curriculum, Schedule } from '@kidsplus/shared/schedule';
import { notifications } from '@mantine/notifications';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { api, ApiClientError, errorMessage } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiClientError && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      onError: (err) =>
        notifications.show({ color: 'red', title: 'Ошибка', message: errorMessage(err) }),
    },
  },
});

export const keys = {
  me: ['me'] as const,
  children: ['children'] as const,
  devices: ['devices'] as const,
  segments: ['segments'] as const,
  childItems: (childId: string) => ['child-items', childId] as const,
  decks: ['decks'] as const,
  games: ['games'] as const,
  moderation: ['moderation'] as const,
  llmUsage: ['llm-usage'] as const,
  questions: (segmentId: string) => ['questions', segmentId] as const,
  schedule: (childId: string) => ['schedule', childId] as const,
  curricula: (childId: string) => ['curricula', childId] as const,
  now: (childId: string) => ['now', childId] as const,
  pin: ['pin'] as const,
  analytics: (childId: string, days: number) => ['analytics', childId, days] as const,
  reports: (childId: string) => ['reports', childId] as const,
};

/** Текущий родитель; null — не вошёл. */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async (): Promise<ParentMe | null> => {
      try {
        return await api.get<ParentMe>('/parent/me');
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export const useChildren = () =>
  useQuery({ queryKey: keys.children, queryFn: () => api.get<Child[]>('/parent/children') });

export const useDevices = (refetchInterval?: number) =>
  useQuery({
    queryKey: keys.devices,
    queryFn: () => api.get<Device[]>('/parent/devices'),
    ...(refetchInterval ? { refetchInterval } : {}),
  });

export const useSegments = () =>
  useQuery({ queryKey: keys.segments, queryFn: () => api.get<Segment[]>('/parent/segments') });

export const useChildItems = (childId: string | null) =>
  useQuery({
    queryKey: keys.childItems(childId ?? ''),
    queryFn: () => api.get<ChildItem[]>(`/parent/children/${childId}/items`),
    enabled: Boolean(childId),
  });

export const useGames = () =>
  useQuery({ queryKey: keys.games, queryFn: () => api.get<Game[]>('/parent/games') });

export const useDecks = () =>
  useQuery({
    queryKey: keys.decks,
    queryFn: () => api.get<Deck[]>('/parent/decks'),
    // Пока озвучка карточек готовится — обновляем раз в 3 секунды.
    refetchInterval: (q) =>
      q.state.data?.some((d) => d.cards.some((c) => c.audio?.status === 'pending')) ? 3000 : false,
  });

export const useQuestions = (segmentId: string) =>
  useQuery({
    queryKey: keys.questions(segmentId),
    queryFn: () => api.get<Question[]>(`/parent/segments/${segmentId}/questions`),
    refetchInterval: (q) =>
      q.state.data?.some((x) => x.audio?.status === 'pending') ? 3000 : false,
  });

export const useSchedule = (childId: string | null) =>
  useQuery({
    queryKey: keys.schedule(childId ?? ''),
    queryFn: () => api.get<Schedule>(`/parent/children/${childId}/schedule`),
    enabled: Boolean(childId),
  });

export const useCurricula = (childId: string | null) =>
  useQuery({
    queryKey: keys.curricula(childId ?? ''),
    queryFn: () => api.get<Curriculum[]>(`/parent/children/${childId}/curricula`),
    enabled: Boolean(childId),
  });

/** Что ребёнок делает сейчас — обновляется каждые 5 секунд. */
export const useChildNow = (childId: string) =>
  useQuery({
    queryKey: keys.now(childId),
    queryFn: () => api.get<ChildNow>(`/parent/children/${childId}/now`),
    refetchInterval: 5000,
  });

export const usePin = () =>
  useQuery({
    queryKey: keys.pin,
    queryFn: () => api.get<{ pinSet: boolean }>('/parent/settings/pin'),
  });

export const useAnalytics = (childId: string | null, days: number) =>
  useQuery({
    queryKey: keys.analytics(childId ?? '', days),
    queryFn: () => api.get<ChildAnalytics>(`/parent/children/${childId}/analytics?days=${days}`),
    enabled: Boolean(childId),
  });

export const useReports = (childId: string | null) =>
  useQuery({
    queryKey: keys.reports(childId ?? ''),
    queryFn: () => api.get<WeeklyReport[]>(`/parent/children/${childId}/reports`),
    enabled: Boolean(childId),
  });
