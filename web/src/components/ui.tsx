"use client";

// Shared controls and class names (UI polish, Oct 2026) so every panel and
// pop-up uses the same buttons, inputs, segmented choices and row menus.
import { useEffect, useRef, useState } from "react";
import { MoreIcon } from "./icons";

/** Filled pink: the ONE main action on a screen or in a window. */
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent-strong)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-strong-hover)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted)]";
/** Outlined neutral: secondary actions. */
export const BTN_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--fg)] transition-colors hover:border-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50";
/** Plain text: tertiary actions. */
export const BTN_QUIET =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:opacity-40";
/** Square icon button, 32px so it is easy to hit. */
export const BTN_ICON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40";
/** Text inputs sit on the page background. INPUT_BOX has no width so a caller can size it. */
export const INPUT_BOX =
  "min-w-0 rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-[var(--muted)] focus:outline-none";
export const INPUT = `${INPUT_BOX} w-full`;
/** Styled native select: same box as inputs, our own chevron. */
export const SELECT = `${INPUT} lockedin-select appearance-none pr-9`;
/** Small field label above an input. */
export const FIELD_LABEL = "mb-1.5 block text-[13px] text-[var(--muted)]";
/** Panel card. */
export const CARD = "rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5";
/** Card heading: one style for every panel. */
export const CARD_TITLE = "text-base font-semibold text-[var(--fg)]";
/** Small caps label inside a card (section names inside lists). */
export const SECTION_LABEL = "text-xs font-medium uppercase tracking-wide text-[var(--muted)]";
/** Toasts all appear in one place: bottom centre. */
export const TOAST =
  "fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-4 py-2.5 text-sm text-[var(--fg)] shadow-[0_6px_16px_rgba(0,0,0,0.3)]";

/**
 * One strip of choices split by 1px lines (minutes, lock mode, styles).
 * The chosen one gets the outline colour fill, the rest stay quiet.
 */
export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: Array<{ value: T; label: string; ariaLabel?: string; disabled?: boolean }>;
  value: T | undefined;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex max-w-full overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)] ${className}`}
      style={{ gap: 1 }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            disabled={option.disabled}
            aria-pressed={active}
            aria-label={option.ariaLabel}
            className={`flex-1 whitespace-nowrap px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "bg-[var(--line)] font-medium text-[var(--fg)]"
                : "bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The "more" button on a row: a small flat menu (Links, Notes, Delete).
 * Arrow keys move, Enter picks, Escape or a click outside closes.
 */
export function RowMenu({
  label,
  items,
  className = "",
  buttonContent,
  buttonClassName = BTN_ICON,
}: {
  label: string;
  items: MenuItem[];
  className?: string;
  /** Defaults to the three-dot icon; the top bar passes "Tools" text. */
  buttonContent?: React.ReactNode;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    itemRefs.current.find((item) => item && !item.disabled)?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const move = (from: number, step: number) => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);
    if (enabled.length === 0) return;
    const current = enabled.indexOf(itemRefs.current[from] as HTMLButtonElement);
    enabled[(current + step + enabled.length) % enabled.length].focus();
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          const rect = buttonRef.current?.getBoundingClientRect();
          setUp(rect ? window.innerHeight - rect.bottom < 160 : false);
          setOpen((prev) => !prev);
        }}
        className={buttonClassName}
      >
        {buttonContent ?? <MoreIcon />}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(index, 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(index, -1);
            } else if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
          className={`absolute right-0 z-30 min-w-44 whitespace-nowrap rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-1 shadow-[0_6px_16px_rgba(0,0,0,0.3)] ${
            up ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--line)] focus:bg-[var(--line)] focus:outline-none disabled:opacity-40 ${
                item.danger ? "text-[var(--bad)]" : "text-[var(--fg)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
