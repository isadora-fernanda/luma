export const DAY_MS = 24 * 60 * 60 * 1000;
export const BASE_EVENT_DURATION_DAYS = 7;
export const PARTICIPANT_ACCESS_DAYS = 7;
export const ORGANIZER_ACCESS_DAYS = 14;

export function startIsAfterCurrentMinute(startsAt: Date, now = new Date()) {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(now.getTime())) return false;
  return Math.floor(startsAt.getTime() / 60_000) > Math.floor(now.getTime() / 60_000);
}

export function dateInputInTimeZone(reference = new Date(), timeZone = 'America/Sao_Paulo') {
  if (!Number.isFinite(reference.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(reference);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function startDateIsTodayOrLater(startsAtInput: string, todayInput: string) {
  const inputPattern = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = startsAtInput.slice(0, 10);
  const today = todayInput.slice(0, 10);
  return inputPattern.test(startDate) && inputPattern.test(today) && startDate >= today;
}

export function eventEndFromStart(startsAt: Date, durationDays = BASE_EVENT_DURATION_DAYS) {
  return new Date(startsAt.getTime() + durationDays * DAY_MS);
}

export function eventDurationDays(startsAt: Date, endsAt: Date) {
  const duration = endsAt.getTime() - startsAt.getTime();
  if (!Number.isFinite(duration) || duration <= 0) return BASE_EVENT_DURATION_DAYS;
  return Math.max(BASE_EVENT_DURATION_DAYS, Math.round(duration / DAY_MS));
}

export function shiftedEventWindow(
  currentStart: Date,
  currentEnd: Date,
  nextStart: Date,
  participantAccessUntil: Date,
  organizerAccessUntil: Date,
) {
  const durationMs = Math.max(BASE_EVENT_DURATION_DAYS * DAY_MS, currentEnd.getTime() - currentStart.getTime());
  const nextEnd = new Date(nextStart.getTime() + durationMs);
  const participantOffset = Math.max(PARTICIPANT_ACCESS_DAYS * DAY_MS, participantAccessUntil.getTime() - currentEnd.getTime());
  const organizerOffset = Math.max(ORGANIZER_ACCESS_DAYS * DAY_MS, organizerAccessUntil.getTime() - currentEnd.getTime());
  return {
    startsAt: nextStart,
    endsAt: nextEnd,
    participantAccessUntil: new Date(nextEnd.getTime() + participantOffset),
    organizerAccessUntil: new Date(nextEnd.getTime() + organizerOffset),
  };
}
