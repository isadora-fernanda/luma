import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASE_EVENT_DURATION_DAYS,
  DAY_MS,
  dateInputInTimeZone,
  eventDurationDays,
  eventEndFromStart,
  shiftedEventWindow,
  startDateIsTodayOrLater,
  startIsAfterCurrentMinute,
} from '../src/event-schedule.ts';

test('a criação exige uma data em um minuto futuro', () => {
  const now = new Date('2026-09-24T12:30:45.000Z');
  assert.equal(startIsAfterCurrentMinute(new Date('2026-09-24T12:30:59.000Z'), now), false);
  assert.equal(startIsAfterCurrentMinute(new Date('2026-09-24T12:29:00.000Z'), now), false);
  assert.equal(startIsAfterCurrentMinute(new Date('2026-09-24T12:31:00.000Z'), now), true);
});

test('a criação aceita qualquer horário de hoje, mas rejeita dias anteriores', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  const today = dateInputInTimeZone(now);
  assert.equal(today, '2026-09-28');
  assert.equal(startDateIsTodayOrLater('2026-09-28T08:00', today), true);
  assert.equal(startDateIsTodayOrLater('2026-09-27T23:59', today), false);
  assert.equal(startDateIsTodayOrLater('2026-09-29T00:00', today), true);
  assert.equal(startDateIsTodayOrLater('data-invalida', today), false);
});

test('todo novo evento termina sete dias depois do início', () => {
  const start = new Date('2026-10-03T18:15:00.000Z');
  const end = eventEndFromStart(start);
  assert.equal(end.getTime() - start.getTime(), BASE_EVENT_DURATION_DAYS * DAY_MS);
  assert.equal(eventDurationDays(start, end), 7);
});

test('a remarcação preserva duração estendida e janelas pós-evento', () => {
  const currentStart = new Date('2026-10-03T18:15:00.000Z');
  const currentEnd = new Date('2026-10-10T18:15:00.000Z');
  const nextStart = new Date('2026-11-10T09:00:00.000Z');
  const shifted = shiftedEventWindow(
    currentStart,
    currentEnd,
    nextStart,
    new Date(currentEnd.getTime() + 7 * DAY_MS),
    new Date(currentEnd.getTime() + 14 * DAY_MS),
  );

  assert.equal(shifted.endsAt.getTime() - shifted.startsAt.getTime(), 7 * DAY_MS);
  assert.equal(shifted.participantAccessUntil.getTime() - shifted.endsAt.getTime(), 7 * DAY_MS);
  assert.equal(shifted.organizerAccessUntil.getTime() - shifted.endsAt.getTime(), 14 * DAY_MS);
});
