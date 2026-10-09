// Time study (SPEC 8.11): periodic "What are you doing right now?" check-ins
// driven by chrome.alarms so they fire with the dashboard closed. The pure
// decision logic lives here; the service worker applies it against chrome.*.

export const TIME_STUDY_ALARM = "lockedin-time-study";
export const TIME_STUDY_CHOICES = [5, 15, 30, 45, 60] as const;
export type TimeStudyChoice = (typeof TIME_STUDY_CHOICES)[number];

export function isTimeStudyChoice(minutes: number): minutes is TimeStudyChoice {
  return (TIME_STUDY_CHOICES as readonly number[]).includes(minutes);
}

/** The alarm spec for a check-in interval, or null when time study is off. */
export function timeStudyAlarm(minutes: number | null): { name: string; periodInMinutes: number } | null {
  if (minutes === null || !isTimeStudyChoice(minutes)) return null;
  return { name: TIME_STUDY_ALARM, periodInMinutes: minutes };
}
