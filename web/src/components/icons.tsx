// Line icons (UI polish, Oct 2026). One stroke style everywhere instead of
// typed characters (v, >, X, ▶, ↗, ✎, ⧉). currentColor so they follow text colour.

type IconProps = { size?: number; className?: string };

function Svg({ size = 16, className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4l4 4-4 4" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${props.className ?? ""}`}
    >
      <path d="M5 3.5v9l7.5-4.5z" />
    </svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${props.className ?? ""}`}
    >
      <circle cx="3.5" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="12.5" cy="8" r="1.3" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 9.5l3-3" />
      <path d="M7.5 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1" />
      <path d="M8.5 11.5l-1 1A2.5 2.5 0 014 9l1-1" />
    </Svg>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 2.5h5.5L12 5v8.5H4z" />
      <path d="M6.5 8h3M6.5 10.5h3" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={`shrink-0 ${props.className ?? ""}`}
    >
      {[4, 8, 12].map((y) => (
        <g key={y}>
          <circle cx="6" cy={y} r="1.1" />
          <circle cx="10" cy={y} r="1.1" />
        </g>
      ))}
    </svg>
  );
}

export function PopOutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 3h4v4M13 3L8 8" />
      <path d="M11.5 9.5v3.5h-8.5v-8.5h3.5" />
    </Svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M6.5 6.5a1.5 1.5 0 112 1.4c-.4.2-.5.5-.5.9v.2" />
      <circle cx="8" cy="11.25" r=".5" fill="currentColor" stroke="none" />
    </Svg>
  );
}
