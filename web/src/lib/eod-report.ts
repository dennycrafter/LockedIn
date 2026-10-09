// Pure EOD report logic (SPEC 8.13): America/Chicago day context, duration
// math and the email builder. No I/O here so the golden tests run without a
// network or a database.

export type EodSessionRow = {
  activeSeconds: number;
  startedAt: string; // ISO timestamp
  label: string | null; // resolved task / project / misc display label
};

export type EodInfractionRow = {
  kind: "site" | "manual";
  detail: string;
  occurredAt: string; // ISO timestamp
};

export type EodTimeStudyRow = {
  text: string;
  occurredAt: string; // ISO timestamp
};

export type EodReview = {
  doneToday: string;
  learned: string;
  finishedGoal: boolean | null;
  bestUse: boolean | null;
  bestUseNote: string;
};

export type EodPlan = {
  startTime: string;
  location: string;
  tasks: string[];
};

// One day's worth of EOD source data, resolved by eod-data.ts.
export type EodDayData = {
  sessions: EodSessionRow[];
  infractions: EodInfractionRow[];
  timeStudies: EodTimeStudyRow[];
  review: EodReview | null;
  plan: EodPlan | null;
};

export type EodEdits = { doneToday: string; learned: string };

export type EodContext = {
  dateLabel: string; // "Fri 9 Oct"
  todayIso: string; // Chicago date of `now`, "YYYY-MM-DD"
  tomorrowIso: string; // Chicago date of tomorrow, "YYYY-MM-DD"
  startIso: string; // UTC instant of Chicago midnight today
  endIso: string; // UTC instant of Chicago midnight tomorrow
};

export type EodEmail = { subject: string; html: string; text: string };

const CHICAGO_TZ = "America/Chicago";
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ChicagoParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekdayShort: string;
};

function chicagoParts(instant: Date): ChicagoParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CHICAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekdayShort: get("weekday"),
  };
}

function chicagoOffsetMinutes(instant: Date): number {
  const p = chicagoParts(instant);
  const wallAsUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wallAsUtcMs - instant.getTime()) / 60000);
}

// Chicago wall clock to UTC instant; two passes converge across DST shifts.
function chicagoWallToUtc(year: number, month: number, day: number, hour = 0): Date {
  const wallAsUtcMs = Date.UTC(year, month - 1, day, hour);
  let utcMs = wallAsUtcMs;
  for (let i = 0; i < 2; i++) {
    utcMs = wallAsUtcMs - chicagoOffsetMinutes(new Date(utcMs)) * 60_000;
  }
  return new Date(utcMs);
}

function isoDay(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

// SPEC 3: every "today" boundary uses America/Chicago, never UTC.
export function getEodContext(now: Date): EodContext {
  const p = chicagoParts(now);
  const start = chicagoWallToUtc(p.year, p.month, p.day, 0);
  const rolled = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const tomorrow = {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth() + 1,
    day: rolled.getUTCDate(),
  };
  const end = chicagoWallToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 0);
  const startParts = chicagoParts(start);
  return {
    dateLabel: `${startParts.weekdayShort} ${startParts.day} ${MONTHS_SHORT[startParts.month - 1]}`,
    todayIso: isoDay(p.year, p.month, p.day),
    tomorrowIso: isoDay(tomorrow.year, tomorrow.month, tomorrow.day),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

// "3h 20m" style. 0 renders as "0m", sub-minute values round to minutes.
export function formatFocusedDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const totalMinutes = Math.round(safe / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// SPEC 8.13 subject format: "LockedIn EOD: Fri 9 Oct, 3h 20m focused".
export function eodSubject(dateLabel: string, totalSeconds: number): string {
  return `LockedIn EOD: ${dateLabel}, ${formatFocusedDuration(totalSeconds)} focused`;
}

export function totalFocusedSeconds(sessions: EodSessionRow[]): number {
  return sessions.reduce((sum, s) => sum + (Number.isFinite(s.activeSeconds) ? s.activeSeconds : 0), 0);
}

export type EodTimeByTask = { label: string; seconds: number };

// Focused time per label, sorted descending, ties alphabetical.
export function groupTimeByTask(sessions: EodSessionRow[]): EodTimeByTask[] {
  const byLabel = new Map<string, number>();
  for (const s of sessions) {
    const label = s.label && s.label.trim() !== "" ? s.label : "Unlabelled session";
    const seconds = Number.isFinite(s.activeSeconds) ? s.activeSeconds : 0;
    byLabel.set(label, (byLabel.get(label) ?? 0) + seconds);
  }
  return [...byLabel.entries()]
    .map(([label, seconds]) => ({ label, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label));
}

export function infractionLabel(infraction: { kind: "site" | "manual"; detail: string }): string {
  return infraction.kind === "site"
    ? `Blocked site: ${infraction.detail}`
    : `Manual: ${infraction.detail}`;
}

export function yesNoAnswer(value: boolean | null): string {
  return value === null ? "Not answered" : value ? "Yes" : "No";
}

// Chicago wall clock time for an ISO timestamp, e.g. "11:00 AM". Empty for
// unparseable input.
export function formatChicagoTime(iso: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const MUTED = "#9a9aa3";
const FG = "#f2f2f4";
const FONT_STACK = `-apple-system, "Segoe UI", Inter, system-ui, sans-serif`;

function pHtml(text: string, color = FG): string {
  return `<p style="margin:2px 0;color:${color};">${escapeHtml(text)}</p>`;
}

function sectionHtml(heading: string, bodyHtml: string): string {
  return `<h3 style="margin:18px 0 6px;font-size:14px;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(heading)}</h3>${bodyHtml}`;
}

function ulHtml(items: string[]): string {
  return `<ul style="margin:2px 0;padding-left:18px;">${items
    .map((item) => `<li style="margin:2px 0;color:${FG};">${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

export function buildEodEmail(data: EodDayData, context: EodContext, edits: EodEdits): EodEmail {
  const totalSeconds = totalFocusedSeconds(data.sessions);
  const perTask = groupTimeByTask(data.sessions);
  const doneToday = oneLine(edits.doneToday);
  const learned = oneLine(edits.learned);
  const review = data.review;
  const plan = data.plan;

  const doneLines: string[] = doneToday ? [doneToday] : ["Nothing written down."];
  const learnedLines: string[] = learned ? [learned] : ["Nothing written down."];

  const bestUseNote = oneLine(review?.bestUseNote ?? "");
  const planLines: string[] = plan
    ? [
        `Start: ${plan.startTime.trim() !== "" ? plan.startTime.trim() : "not set"}`,
        `Where: ${plan.location.trim() !== "" ? plan.location.trim() : "not set"}`,
        ...(plan.tasks.map((t) => oneLine(t)).filter((t) => t !== "").length > 0
          ? plan.tasks.map((t) => oneLine(t)).filter((t) => t !== "")
          : ["No tasks planned yet."]),
      ]
    : ["No plan yet."];

  const timeStudyLines = data.timeStudies
    .map((t) => ({ at: formatChicagoTime(t.occurredAt), text: oneLine(t.text) }))
    .filter((t) => t.text !== "")
    .map((t) => `${t.at}: ${t.text}`);
  const infractionLines = data.infractions
    .map((i) => `${formatChicagoTime(i.occurredAt)}: ${infractionLabel(i)}`);
  const perTaskLines = perTask.map((t) => `${t.label}: ${formatFocusedDuration(t.seconds)}`);

  const html = [
    `<div style="font-family:${FONT_STACK};background:#0b0b0d;color:${FG};padding:24px;border-radius:8px;max-width:600px;">`,
    `<h2 style="margin:0 0 4px;font-size:20px;color:${FG};">LockedIn end of day report</h2>`,
    pHtml(context.dateLabel, MUTED),
    `<p style="margin:14px 0 2px;font-size:16px;color:${FG};">Total focused time: ${escapeHtml(formatFocusedDuration(totalSeconds))}</p>`,
    pHtml(`Sessions today: ${data.sessions.length}`),
    sectionHtml("Done today", doneLines.map((l) => pHtml(l)).join("")),
    sectionHtml("Finished planned work", pHtml(yesNoAnswer(review?.finishedGoal ?? null))),
    sectionHtml(
      "Good use of time",
      pHtml(yesNoAnswer(review?.bestUse ?? null)) +
        (bestUseNote !== "" ? pHtml(bestUseNote, MUTED) : ""),
    ),
    sectionHtml("What I learned", learnedLines.map((l) => pHtml(l)).join("")),
    sectionHtml("Tomorrow plan", ulHtml(planLines)),
    sectionHtml(
      "Time studies today",
      ulHtml(timeStudyLines.length > 0 ? timeStudyLines : ["No time studies today."]),
    ),
    sectionHtml(
      "Time per task today",
      ulHtml(perTaskLines.length > 0 ? perTaskLines : ["No focused time recorded."]),
    ),
    sectionHtml(
      `Infractions today: ${data.infractions.length}`,
      ulHtml(infractionLines.length > 0 ? infractionLines : ["No infractions today."]),
    ),
    `</div>`,
  ].join("\n");

  const textLines: string[] = [
    `LockedIn end of day report: ${context.dateLabel}`,
    "",
    `Total focused time: ${formatFocusedDuration(totalSeconds)}`,
    `Sessions today: ${data.sessions.length}`,
    "",
    "Done today",
    ...doneLines.map((l) => `- ${l}`),
    "",
    `Finished planned work: ${yesNoAnswer(review?.finishedGoal ?? null)}`,
    `Good use of time: ${yesNoAnswer(review?.bestUse ?? null)}`,
    ...(bestUseNote !== "" ? [`- ${bestUseNote}`] : []),
    "",
    "What I learned",
    ...learnedLines.map((l) => `- ${l}`),
    "",
    "Tomorrow plan",
    ...planLines.map((l) => `- ${l}`),
    "",
    "Time studies today",
    ...(timeStudyLines.length > 0 ? timeStudyLines.map((l) => `- ${l}`) : ["- No time studies today."]),
    "",
    "Time per task today",
    ...(perTaskLines.length > 0 ? perTaskLines.map((l) => `- ${l}`) : ["- No focused time recorded."]),
    "",
    `Infractions today: ${data.infractions.length}`,
    ...(infractionLines.length > 0 ? infractionLines.map((l) => `- ${l}`) : ["- No infractions today."]),
  ];

  return {
    subject: eodSubject(context.dateLabel, totalSeconds),
    html,
    text: textLines.join("\n"),
  };
}
