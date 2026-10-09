// Time study check-in intervals (SPEC 8.11): off, or one of these minute
// values. Shared by the settings API, the panel and anything else that needs
// to agree on the choices.
export const TIME_STUDY_CHOICES = [5, 15, 30, 45, 60] as const;

export type TimeStudyChoice = (typeof TIME_STUDY_CHOICES)[number];

export function isTimeStudyChoice(value: unknown): value is TimeStudyChoice {
  return typeof value === "number" && TIME_STUDY_CHOICES.includes(value as TimeStudyChoice);
}
