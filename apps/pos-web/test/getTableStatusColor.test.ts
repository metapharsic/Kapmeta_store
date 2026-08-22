import { describe, expect, it } from 'vitest';
import { getTableStatusColor } from '../src/lib/getTableStatusColor';

describe('getTableStatusColor', () => {
  it('maps null status to grey (blank/open table)', () => {
    expect(getTableStatusColor(null, false)).toBe('grey');
  });

  it('maps "open" status to grey', () => {
    expect(getTableStatusColor('open', false)).toBe('grey');
    expect(getTableStatusColor('open', true)).toBe('grey');
  });

  it('maps "running" with kotSent=false to blue', () => {
    expect(getTableStatusColor('running', false)).toBe('blue');
  });

  it('maps "running" with kotSent=true to yellow', () => {
    expect(getTableStatusColor('running', true)).toBe('yellow');
  });

  it('maps "printed" to green regardless of kotSent', () => {
    expect(getTableStatusColor('printed', true)).toBe('green');
    expect(getTableStatusColor('printed', false)).toBe('green');
  });

  it('maps "paid" to orange regardless of kotSent', () => {
    expect(getTableStatusColor('paid', true)).toBe('orange');
    expect(getTableStatusColor('paid', false)).toBe('orange');
  });

  it('maps "cancelled" to a muted red state', () => {
    // Cancelled is not shown in the locked screenshots (a cancelled order
    // does not normally keep a table occupied), but a muted/desaturated red
    // is the conventional choice here: it flags "abnormal" distinctly from
    // "paid" (orange, a positive terminal state) and "open" (grey, neutral),
    // without reading as an active/urgent alert like a saturated red would.
    expect(getTableStatusColor('cancelled', true)).toBe('mutedRed');
    expect(getTableStatusColor('cancelled', false)).toBe('mutedRed');
  });
});
