import { Badge, Button, Card, Code, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';

/**
 * Проверка синтеза речи на устройстве (открывать в Chrome на телефоне ребёнка, вход не нужен).
 * Показывает голоса, которые видит браузер, и озвучивает фразы так же, как детское приложение.
 */

const SAMPLES = {
  ru: { lang: 'ru-RU', text: 'Кошка. Молодец, ты справилась!' },
  en: { lang: 'en-US', text: 'Cat. Dog. Apple.' },
  zh: { lang: 'zh-CN', text: '猫' },
};

const norm = (s: string) => s.toLowerCase().replace(/_/g, '-');

function pickVoice(lang: string, voices: SpeechSynthesisVoice[]) {
  const base = norm(lang).split('-')[0];
  const exact = voices.filter((v) => norm(v.lang) === norm(lang));
  const pool = exact.length ? exact : voices.filter((v) => norm(v.lang).split('-')[0] === base);
  return pool.find((v) => v.localService) ?? pool[0];
}

function say(text: string, lang: string, explicitVoice: boolean): Promise<string> {
  return new Promise((resolve) => {
    const s = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.85;
    const v = explicitVoice ? pickVoice(lang, s.getVoices()) : undefined;
    if (v) u.voice = v;
    const t = setTimeout(() => resolve('нет события окончания'), 8000);
    u.onend = () => {
      clearTimeout(t);
      resolve(`голос: ${v ? `${v.name} (${v.lang})` : 'по умолчанию'}`);
    };
    u.onerror = (e) => {
      clearTimeout(t);
      resolve(`ошибка: ${e.error}`);
    };
    s.speak(u);
  });
}

export function VoicesPage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  const run = async (label: string, steps: [string, string][], explicitVoice = true) => {
    window.speechSynthesis.cancel();
    for (const [text, lang] of steps) {
      const r = await say(text, lang, explicitVoice);
      setLog((l) => [`${label}: «${text}» (${lang}) — ${r}`, ...l]);
    }
  };

  const ru = voices.filter((v) => norm(v.lang).startsWith('ru'));
  const en = voices.filter((v) => norm(v.lang).startsWith('en'));

  return (
    <Stack p="md" maw={720} mx="auto">
      <Title order={3}>Проверка голосов</Title>
      <Text size="sm" c="dimmed">
        Откройте эту страницу в Chrome на телефоне ребёнка. Озвучка в детском приложении работает
        так же.
      </Text>
      {!supported && <Text c="red">Этот браузер не поддерживает синтез речи.</Text>}

      <Group gap="xs">
        <Badge color={ru.length ? 'green' : 'red'}>русских голосов: {ru.length}</Badge>
        <Badge color={en.length ? 'green' : 'red'}>английских: {en.length}</Badge>
        <Badge color="gray">всего: {voices.length}</Badge>
      </Group>

      <Card withBorder>
        <Stack gap="xs">
          <Button onClick={() => run('RU', [[SAMPLES.ru.text, SAMPLES.ru.lang]])}>
            Сказать по-русски
          </Button>
          <Button onClick={() => run('EN', [[SAMPLES.en.text, SAMPLES.en.lang]])}>
            Say in English
          </Button>
          <Button
            onClick={() =>
              run('Карточка', [
                ['cat', 'en-US'],
                ['кошка', 'ru-RU'],
              ])
            }
          >
            Как в карточке: cat → кошка
          </Button>
          <Button
            variant="default"
            onClick={() =>
              run(
                'Без явного голоса',
                [
                  ['cat', 'en-US'],
                  ['кошка', 'ru-RU'],
                ],
                false,
              )
            }
          >
            То же, без выбора голоса (только язык)
          </Button>
        </Stack>
      </Card>

      {log.length > 0 && (
        <Card withBorder>
          <Stack gap={4}>
            {log.map((l, i) => (
              <Code key={i} block>
                {l}
              </Code>
            ))}
          </Stack>
        </Card>
      )}

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Голос</Table.Th>
            <Table.Th>Язык</Table.Th>
            <Table.Th>На телефоне</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {[...voices]
            .sort((a, b) => a.lang.localeCompare(b.lang))
            .map((v) => (
              <Table.Tr key={v.voiceURI + v.lang}>
                <Table.Td>
                  {v.name}
                  {v.default ? ' (по умолчанию)' : ''}
                </Table.Td>
                <Table.Td>{v.lang}</Table.Td>
                <Table.Td>{v.localService ? 'да' : 'сеть'}</Table.Td>
              </Table.Tr>
            ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
