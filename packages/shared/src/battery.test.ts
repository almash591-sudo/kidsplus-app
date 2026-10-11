import { describe, expect, it } from 'vitest';
import { batteryTone, batteryVoice, initialBatteryVoice, type BatteryVoiceState } from './battery';

const run = (levels: (number | 'c')[]) => {
  let state: BatteryVoiceState = initialBatteryVoice();
  const said: (string | number | null)[] = [];
  for (const l of levels) {
    const r = batteryVoice(
      state,
      l === 'c' ? { level: 50, charging: true } : { level: l, charging: false },
    );
    state = r.state;
    said.push(r.say);
  }
  return said;
};

describe('напоминания о заряде', () => {
  it('каждый порог — один раз за разряд', () => {
    expect(run([30, 21, 20, 19, 15, 10, 9, 6, 5, 4])).toEqual([
      null,
      null,
      20,
      null,
      null,
      10,
      null,
      null,
      5,
      null,
    ]);
  });

  it('скачок ниже нескольких порогов — только самый низкий', () => {
    expect(run([40, 8, 7])).toEqual([null, 10, null]);
  });

  it('зарядка: «заряжается» при подключении, потом пороги заново', () => {
    expect(run([20, 'c', 'c', 20, 10])).toEqual([20, 'charging', null, 20, 10]);
  });

  it('приложение открылось уже на зарядке — молчит', () => {
    expect(run(['c'])).toEqual([null]);
  });

  it('заряд поднялся выше 25 % без зарядки (калибровка) — пороги заново', () => {
    expect(run([20, 30, 20])).toEqual([20, null, 20]);
  });

  it('цвет значка', () => {
    expect(batteryTone({ level: 21, charging: false })).toBe('ok');
    expect(batteryTone({ level: 20, charging: false })).toBe('low');
    expect(batteryTone({ level: 10, charging: false })).toBe('critical');
    expect(batteryTone({ level: 3, charging: true })).toBe('ok');
  });
});
