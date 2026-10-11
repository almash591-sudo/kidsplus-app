import { describe, expect, it } from 'vitest';
import { loginRequest, pairClaimRequest, segmentUpdateRequest } from './api';

describe('segmentUpdateRequest', () => {
  const base = { title: 'Счёт до 5', childIds: [] };

  it.each([
    [0, 60],
    [30, 330],
  ])('принимает %i–%i с', (startSec, endSec) => {
    expect(segmentUpdateRequest.safeParse({ ...base, startSec, endSec }).success).toBe(true);
  });

  it.each([
    [0, 59],
    [0, 301],
    [100, 90],
  ])('отклоняет %i–%i с', (startSec, endSec) => {
    const r = segmentUpdateRequest.safeParse({ ...base, startSec, endSec });
    expect(r.success).toBe(false);
  });
});

describe('pairClaimRequest', () => {
  it('нормализует регистр и разделители', () => {
    expect(pairClaimRequest.parse({ code: ' abcd-ef23 ' }).code).toBe('ABCDEF23');
  });

  it('отклоняет код неверной длины', () => {
    expect(pairClaimRequest.safeParse({ code: 'ABC' }).success).toBe(false);
  });
});

describe('loginRequest', () => {
  it('приводит email к нижнему регистру', () => {
    expect(loginRequest.parse({ email: ' Mama@Example.COM ', password: 'x' }).email).toBe(
      'mama@example.com',
    );
  });
});
