// Pure decisions for the floating timer (SPEC 8.6), kept out of the DOM so
// they are unit testable: when the float may show, and how drag positions are
// clamped to the viewport.
import type { ActiveSession } from "./session";

export interface FloatEnvironment {
  session: ActiveSession | null;
  floatEnabled: boolean;
  isDashboardOrigin: boolean;
  /** Session id the user hid the float for; resets when a new session starts. */
  hiddenForSessionId: string | null;
}

export function shouldShowFloat(env: FloatEnvironment): boolean {
  if (!env.floatEnabled || env.isDashboardOrigin) return false;
  if (!env.session) return false;
  return env.hiddenForSessionId !== env.session.id;
}

export interface FloatPosition {
  x: number;
  y: number;
}

/**
 * Keep the 220px box on screen: coordinates are the box's top-left corner,
 * clamped so at least the drag header stays reachable even on tiny windows.
 */
export function clampPosition(
  position: FloatPosition,
  viewport: { width: number; height: number },
  box: { width: number; height: number },
): FloatPosition {
  const maxX = Math.max(0, viewport.width - box.width);
  const maxY = Math.max(0, viewport.height - box.height);
  return {
    x: Math.min(Math.max(0, position.x), maxX),
    y: Math.min(Math.max(0, position.y), maxY),
  };
}

/** Bottom right default, 16px from the edges (SPEC 10). */
export function defaultPosition(viewport: { width: number; height: number }): FloatPosition {
  return clampPosition({ x: viewport.width - 220 - 16, y: viewport.height - 220 - 16 }, viewport, {
    width: 220,
    height: 220,
  });
}
