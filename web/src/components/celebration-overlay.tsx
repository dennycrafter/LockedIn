"use client";

// Completion celebration (SPEC 8.10): one burst (single shockwave + sparks +
// confetti), slam title, light shake, auto close after 6s, Escape or click
// closes, reduced-motion variant (fade only, no confetti movement), no sound.

import { useEffect, useMemo } from "react";
import { celebrationMessage, type CelebrationStyle } from "@/lib/celebration";

const CONFETTI_COLORS = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--info)", "var(--bad)", "var(--silver)"];

interface ConfettiBit {
  angle: number;
  distance: number;
  size: number;
  delayMs: number;
  color: string;
}

function confetti(count: number): ConfettiBit[] {
  const bits: ConfettiBit[] = [];
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * 2 * Math.PI + (index % 3) * 0.19;
    bits.push({
      angle,
      distance: 90 + ((index * 37) % 90),
      size: 5 + (index % 4) * 2,
      delayMs: (index % 6) * 30,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    });
  }
  return bits;
}

export function CelebrationOverlay({
  name,
  style,
  onClose,
}: {
  name: string;
  style: CelebrationStyle;
  onClose: () => void;
}) {
  const bits = useMemo(() => confetti(24), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const timer = setTimeout(onClose, 6000);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="All items done"
        onClick={(event) => event.stopPropagation()}
        className="lockedin-celebration relative flex w-full max-w-lg flex-col items-center gap-6 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-6 py-10 text-center shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
      >
        <span className="lockedin-shockwave" aria-hidden />
        <span className="lockedin-sparks" aria-hidden>
          {bits.slice(0, 8).map((bit, index) => (
            <span
              key={index}
              style={{
                ["--angle" as string]: `${(bit.angle * 180) / Math.PI}deg`,
                background: bit.color,
                animationDelay: `${bit.delayMs}ms`,
              }}
            />
          ))}
        </span>
        {bits.map((bit, index) => (
          <span
            key={index}
            aria-hidden
            className="lockedin-confetti"
            style={{
              ["--angle" as string]: `${(bit.angle * 180) / Math.PI}deg`,
              ["--distance" as string]: `${bit.distance}px`,
              width: bit.size,
              height: bit.size,
              background: bit.color,
              animationDelay: `${bit.delayMs}ms`,
            }}
          />
        ))}
        <p
          className="lockedin-slam text-2xl font-semibold text-[var(--fg)] sm:text-3xl"
          style={{ fontFamily: "var(--font-saira), ui-sans-serif, system-ui, sans-serif" }}
        >
          {celebrationMessage(style, name)}
        </p>
        <p className="text-sm text-[var(--muted)]">Every item in this project is done.</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[var(--line)] px-4 py-2 text-sm text-[var(--fg)] hover:border-[var(--muted)]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
