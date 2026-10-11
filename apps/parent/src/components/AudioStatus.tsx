import type { Language, MediaRef } from '@kidsplus/shared/api';
import { ActionIcon, Badge, Tooltip } from '@mantine/core';

const SPEECH_LANG: Record<Language, string> = { ru: 'ru-RU', en: 'en-US', zh: 'zh-CN' };

let player: HTMLAudioElement | null = null;

/** Прослушать фразу: файлом, если озвучка серверная, иначе синтезом речи браузера. */
function listen(text: string, lang: Language, audio: MediaRef | null) {
  player?.pause();
  window.speechSynthesis?.cancel();
  if (audio?.status === 'ready') {
    player = new Audio(audio.url);
    void player.play();
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  u.rate = 0.85;
  window.speechSynthesis?.speak(u);
}

/**
 * Озвучка фразы. audio = null — озвучивает устройство ребёнка (Web Speech API):
 * здесь — тот же текст голосом этого браузера (на телефоне ребёнка голос может отличаться).
 */
export function AudioStatus({
  audio,
  text,
  lang,
}: {
  audio: MediaRef | null;
  text: string;
  lang: Language;
}) {
  if (audio?.status === 'pending') {
    return (
      <Tooltip label="Озвучка генерируется, обычно несколько секунд">
        <Badge color="gray" variant="light">
          озвучка…
        </Badge>
      </Tooltip>
    );
  }
  if (audio?.status === 'failed') {
    return (
      <Badge color="red" variant="light">
        ошибка озвучки
      </Badge>
    );
  }
  return (
    <Tooltip label={audio ? 'Прослушать' : 'Прослушать (голос этого браузера)'}>
      <ActionIcon variant="light" aria-label="Прослушать" onClick={() => listen(text, lang, audio)}>
        🔊
      </ActionIcon>
    </Tooltip>
  );
}
