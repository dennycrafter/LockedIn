// Board (Oct 2026): one infinite whiteboard for ideas, directions and long
// term plays, drawn with Excalidraw. This file is the plain-data side: what a
// saved board looks like, how the API checks it, which copy wins on load, and
// the starter lanes a fresh board opens with. Nothing here imports Excalidraw
// so it stays cheap to test and safe to use in API routes.

/** What we save: Excalidraw's elements and pasted images, plus where you were looking. */
export type BoardScene = {
  elements: unknown[];
  files: Record<string, unknown>;
  view: { scrollX: number; scrollY: number; zoom: number };
};

export type SavedBoard = { scene: BoardScene; savedAt: string };

/** Pasted screenshots are stored inline, so cap a save at 4 MB of JSON (Vercel refuses request bodies over about 4.5 MB). */
export const BOARD_MAX_BYTES = 4 * 1024 * 1024;

export const BOARD_LOCAL_KEY = "lockedin-board";

/** Returns a clean scene or an error message for the API to send back. */
export function parseBoardScene(input: unknown): { scene: BoardScene } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Board must be an object." };
  const raw = input as { elements?: unknown; files?: unknown; view?: unknown };
  if (!Array.isArray(raw.elements)) return { error: "Board elements must be a list." };
  if (raw.elements.some((element) => !element || typeof element !== "object")) {
    return { error: "Every board element must be an object." };
  }
  const files =
    raw.files && typeof raw.files === "object" && !Array.isArray(raw.files)
      ? (raw.files as Record<string, unknown>)
      : {};
  const view = (raw.view ?? {}) as { scrollX?: unknown; scrollY?: unknown; zoom?: unknown };
  const scene: BoardScene = {
    elements: raw.elements,
    files,
    view: {
      scrollX: finiteOr(view.scrollX, 0),
      scrollY: finiteOr(view.scrollY, 0),
      zoom: clamp(finiteOr(view.zoom, 1), 0.1, 30),
    },
  };
  if (byteLength(JSON.stringify(scene)) > BOARD_MAX_BYTES) {
    return { error: "Board is too big to save (over 4 MB). Remove some pasted images." };
  }
  return { scene };
}

/**
 * On load we may have a server copy and a copy saved in this browser (the
 * browser one is written first, so it can be newer if the last server save
 * failed). The newer one wins; a missing one loses.
 */
export function pickNewerBoard(server: SavedBoard | null, local: SavedBoard | null): SavedBoard | null {
  if (!server) return local;
  if (!local) return server;
  return Date.parse(local.savedAt) > Date.parse(server.savedAt) ? local : server;
}

export function readLocalBoard(): SavedBoard | null {
  try {
    const raw = window.localStorage.getItem(BOARD_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scene?: unknown; savedAt?: unknown };
    const result = parseBoardScene(parsed.scene);
    if ("error" in result || typeof parsed.savedAt !== "string") return null;
    return { scene: result.scene, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** Best effort: a full or blocked browser store just means no local backup. */
export function writeLocalBoard(board: SavedBoard): void {
  try {
    window.localStorage.setItem(BOARD_LOCAL_KEY, JSON.stringify(board));
  } catch {
    // ignore
  }
}

// Starter board: three lanes (Excalidraw frames) with one note each that
// explains a move. Plain skeleton objects; the canvas turns them into real
// elements with convertToExcalidrawElements. Frame x/y must not be 0 because
// Excalidraw treats 0 as "work it out from the children".
export const LANE_WIDTH = 460;
export const LANE_HEIGHT = 620;
export const LANE_GAP = 60;
export const NOTE_WIDTH = 380;
export const NOTE_HEIGHT = 120;
/** Excalidraw's FONT_FAMILY.Nunito: a plain, clean font instead of the hand-drawn one. */
export const NUNITO_FONT = 6;

export const STARTER_LANES: ReadonlyArray<{ name: string; tip: string; color: string }> = [
  { name: "Now", tip: "Double-click empty space to write.\nDouble-click a note to edit it.", color: "#ffd8a8" },
  { name: "Next", tip: "Drag notes between lanes\nas plans change.", color: "#a5d8ff" },
  { name: "Long-term plays", tip: "Press F to draw a new lane.\nPress A for an arrow.", color: "#d0bfff" },
];

export function starterSkeleton(origin = { x: 80, y: 80 }): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  STARTER_LANES.forEach((lane, index) => {
    const laneX = origin.x + index * (LANE_WIDTH + LANE_GAP);
    const noteId = `starter-note-${index}`;
    out.push({
      type: "rectangle",
      id: noteId,
      x: laneX + (LANE_WIDTH - NOTE_WIDTH) / 2,
      y: origin.y + 40,
      width: NOTE_WIDTH,
      height: NOTE_HEIGHT,
      backgroundColor: lane.color,
      fillStyle: "solid",
      // Outline in the fill colour so the note reads as one flat block.
      // The label sets its own ink: labels otherwise inherit the outline colour.
      strokeColor: lane.color,
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      label: { text: lane.tip, fontSize: 18, fontFamily: NUNITO_FONT, strokeColor: "#1e1e1e" },
    });
    out.push({
      type: "frame",
      id: `starter-lane-${index}`,
      name: lane.name,
      children: [noteId],
      x: laneX,
      y: origin.y,
      width: LANE_WIDTH,
      height: LANE_HEIGHT,
    });
  });
  return out;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
