import { describe, expect, it } from "vitest";
import { BOARD_MAX_BYTES, STARTER_LANES, parseBoardScene, pickNewerBoard, starterSkeleton } from "./board";

const scene = { elements: [{ id: "a", type: "rectangle" }], files: {}, view: { scrollX: 1, scrollY: 2, zoom: 1 } };

describe("parseBoardScene", () => {
  it("accepts a normal scene", () => {
    expect(parseBoardScene(scene)).toEqual({ scene });
  });

  it("fills in a missing view and files", () => {
    expect(parseBoardScene({ elements: [] })).toEqual({
      scene: { elements: [], files: {}, view: { scrollX: 0, scrollY: 0, zoom: 1 } },
    });
  });

  it("keeps zoom in a sane range", () => {
    const result = parseBoardScene({ elements: [], view: { zoom: 500 } });
    expect("scene" in result && result.scene.view.zoom).toBe(30);
  });

  it("rejects things that are not boards", () => {
    expect(parseBoardScene(null)).toHaveProperty("error");
    expect(parseBoardScene({ elements: "nope" })).toHaveProperty("error");
    expect(parseBoardScene({ elements: [1, 2] })).toHaveProperty("error");
  });

  it("rejects a board over the size cap", () => {
    const big = "x".repeat(BOARD_MAX_BYTES);
    expect(parseBoardScene({ elements: [{ id: "img", note: big }] })).toEqual({
      error: expect.stringMatching(/too big/),
    });
  });
});

describe("pickNewerBoard", () => {
  const older = { scene, savedAt: "2026-10-22T10:00:00.000Z" };
  const newer = { scene, savedAt: "2026-10-22T11:00:00.000Z" };

  it("prefers the newer copy either way round", () => {
    expect(pickNewerBoard(older, newer)).toBe(newer);
    expect(pickNewerBoard(newer, older)).toBe(newer);
  });

  it("uses whichever copy exists", () => {
    expect(pickNewerBoard(null, older)).toBe(older);
    expect(pickNewerBoard(older, null)).toBe(older);
    expect(pickNewerBoard(null, null)).toBeNull();
  });
});

describe("starterSkeleton", () => {
  it("makes one lane and one note per starter lane, notes inside their lane", () => {
    const skeleton = starterSkeleton();
    const frames = skeleton.filter((item) => item.type === "frame");
    expect(frames.map((frame) => frame.name)).toEqual(STARTER_LANES.map((lane) => lane.name));
    for (const frame of frames) {
      const [noteId] = frame.children as string[];
      const note = skeleton.find((item) => item.id === noteId)!;
      expect(note.x as number).toBeGreaterThan(frame.x as number);
      expect((note.x as number) + (note.width as number)).toBeLessThan((frame.x as number) + (frame.width as number));
      // Excalidraw treats a 0 coordinate as "not set", so lanes never sit at 0.
      expect(frame.x).not.toBe(0);
      expect(frame.y).not.toBe(0);
    }
  });
});
