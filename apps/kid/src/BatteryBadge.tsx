import { batteryTone, type BatteryReport } from '@kidsplus/shared/battery';

/** Значок заряда: батарейка с уровнем и процент; на зарядке — молния. */
export function BatteryBadge({ battery }: { battery: BatteryReport | null }) {
  if (!battery) return null;
  const tone = batteryTone(battery);
  return (
    <div
      className={`battery battery-${tone}`}
      data-testid="battery"
      data-level={battery.level}
      data-charging={battery.charging ? '1' : '0'}
      role="img"
      aria-label={`Заряд ${battery.level} %${battery.charging ? ', заряжается' : ''}`}
    >
      <span className="battery-body">
        <span className="battery-fill" style={{ width: `${Math.max(battery.level, 4)}%` }} />
        {battery.charging && <span className="battery-bolt">⚡</span>}
      </span>
      <span className="battery-cap" />
      <span className="battery-text">{battery.level}%</span>
    </div>
  );
}
