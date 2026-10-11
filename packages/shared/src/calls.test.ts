import { describe, expect, it } from 'vitest';
import { callStatus, initiates, peerId, peersToConnect, ringingFor, type CallInfo } from './calls';

const A = 'c:00000000-0000-4000-8000-00000000000a' as const;
const B = 'p:00000000-0000-4000-8000-00000000000b' as const;
const C = 'c:00000000-0000-4000-8000-00000000000c' as const;

const call = (states: Record<string, CallInfo['members'][number]['state']>): CallInfo => {
  const members = Object.entries(states).map(([id, state]) => ({
    id: id as typeof A,
    name: id,
    state,
  }));
  return { id: 'x', video: true, from: A, status: callStatus(members), members, createdAt: '' };
};

describe('звонки', () => {
  it('статус по участникам', () => {
    expect(callStatus([{ state: 'joined' }, { state: 'ringing' }])).toBe('ringing');
    expect(callStatus([{ state: 'joined' }, { state: 'joined' }])).toBe('active');
    expect(callStatus([{ state: 'joined' }, { state: 'declined' }])).toBe('ended');
    expect(callStatus([{ state: 'left' }, { state: 'joined' }])).toBe('ended');
  });

  it('с кем соединяться и кто начинает', () => {
    const c = call({ [A]: 'joined', [B]: 'joined', [C]: 'ringing' });
    expect(peersToConnect(c, A)).toEqual([B]);
    expect(peersToConnect(c, C)).toEqual([]);
    expect(ringingFor(c, C)).toBe(true);
    expect(initiates(A, B) !== initiates(B, A)).toBe(true);
  });

  it('идентификатор участника', () => {
    expect(peerId.safeParse(A).success).toBe(true);
    expect(peerId.safeParse('x:00000000-0000-4000-8000-00000000000a').success).toBe(false);
  });
});
