import { formatClockTime12h, minutesSinceMidnight, parseClockTime, toTimeInputValue } from './clock-time.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('clock time parsing', () => {
  it('accepts LocalTime and LocalDateTime forms', () => {
    expect(parseClockTime('08:05')).toEqual({ hour: 8, minute: 5 });
    expect(parseClockTime('8:05')).toEqual({ hour: 8, minute: 5 });
    expect(parseClockTime('08:05:30')).toEqual({ hour: 8, minute: 5 });
    expect(parseClockTime('08:05:30.123')).toEqual({ hour: 8, minute: 5 });
    expect(parseClockTime('2026-10-14T13:07')).toEqual({ hour: 13, minute: 7 });
    expect(parseClockTime('2026-10-14T13:07:00')).toEqual({ hour: 13, minute: 7 });
    expect(parseClockTime('2026-10-14T13:07:00.123456')).toEqual({ hour: 13, minute: 7 });
  });

  it('trims surrounding spaces the same way everywhere', () => {
    expect(parseClockTime('  09:15  ')).toEqual({ hour: 9, minute: 15 });
    expect(minutesSinceMidnight(' 09:15')).toBe(555);
    expect(formatClockTime12h('09:15 ')).toBe('9:15 AM');
  });

  it('rejects a malformed suffix, a zone/offset, and out-of-range values', () => {
    for (const bad of ['08:05abc', '08:05 PM', '08:5', '24:00', '12:60', '12:30:61', '2026-10-14T08:05:00Z',
      '2026-10-14T08:05:00+05:30', '2026-10-14 08:05', 'T08:05', '', '   ', 'noon']) {
      expect(parseClockTime(bad)).withContext(bad).toBeNull();
      expect(minutesSinceMidnight(bad)).withContext(bad).toBeNull();
      expect(formatClockTime12h(bad)).withContext(bad).toBe('—');
    }
  });

  it('null and undefined are unknown', () => {
    expect(parseClockTime(null)).toBeNull();
    expect(parseClockTime(undefined)).toBeNull();
    expect(formatClockTime12h(null)).toBe('—');
    expect(toTimeInputValue(null)).toBe('');
  });

  it('midnight and noon', () => {
    expect(formatClockTime12h('00:00')).toBe('12:00 AM');
    expect(formatClockTime12h('12:00')).toBe('12:00 PM');
    expect(formatClockTime12h('2026-10-14T00:30:00')).toBe('12:30 AM');
    expect(formatClockTime12h('23:59')).toBe('11:59 PM');
    expect(minutesSinceMidnight('00:00')).toBe(0);
    expect(minutesSinceMidnight('12:00')).toBe(720);
  });

  it('time input value is HH:mm from either form, never shifted by the device time zone', () => {
    expect(toTimeInputValue('2026-10-14T08:05:00')).toBe('08:05');
    expect(toTimeInputValue('8:05')).toBe('08:05');
    expect(toTimeInputValue('08:05xyz')).toBe('');
  });
});
