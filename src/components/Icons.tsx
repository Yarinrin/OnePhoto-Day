/**
 * One icon family: 24px grid, 2.3 stroke, round joins — the same weight as
 * the borders around them, so nothing reads as imported from elsewhere.
 */

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Svg({
  size = 24,
  className,
  strokeWidth = 2.3,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 10.4 12 3.6l8.5 6.8V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
    <path d="M9.3 21v-6.2h5.4V21" />
  </Svg>
);

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.6a1 1 0 0 1 1-1h2.9l1.5-2.4h7.2L17.1 7.6H20a1 1 0 0 1 1 1v9.8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <circle cx="12" cy="13.2" r="3.7" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.2" y="5" width="17.6" height="16" rx="2" />
    <path d="M3.2 10h17.6M8.2 3v4M15.8 3v4" />
    <circle cx="8.4" cy="14.6" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="14.6" r="1.15" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.4" cy="8.4" r="3.6" />
    <path d="M2.8 20.2c.5-3.6 3.3-5.8 6.6-5.8s6.1 2.2 6.6 5.8" />
    <path d="M16.4 5.2a3.6 3.6 0 0 1 0 6.9M18 14.9c2.1.7 3.4 2.6 3.7 5.3" />
  </Svg>
);

export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.2" r="4" />
    <path d="M4.4 20.6c.7-4 3.8-6.4 7.6-6.4s6.9 2.4 7.6 6.4" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4.5 7.5 12l7.5 7.5" />
  </Svg>
);

export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4.5 16.5 12 9 19.5" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.8 9.6 18 19.5 6.6" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.6" y="8.6" width="12" height="12" rx="2" />
    <path d="M15.4 5.4V4.4a1 1 0 0 0-1-1H4.4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1" />
  </Svg>
);

export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="18" cy="5.6" r="2.8" />
    <circle cx="6" cy="12" r="2.8" />
    <circle cx="18" cy="18.4" r="2.8" />
    <path d="M8.5 10.6 15.5 7M8.5 13.4l7 3.6" />
  </Svg>
);

/** Sliders, not a gear — at this stroke weight a gear turns to mush. */
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.4 7.6h4.1M13.1 7.6h7.5M3.4 16.4h7.5M16.2 16.4h4.4" />
    <circle cx="10.3" cy="7.6" r="2.8" />
    <circle cx="13.4" cy="16.4" r="2.8" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.6h15M9.4 6.6V4.4a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1v2.2" />
    <path d="M6.5 6.6 7.4 20a1 1 0 0 0 1 1h7.2a1 1 0 0 0 1-1l.9-13.4" />
  </Svg>
);

export const IconImage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2" />
    <circle cx="8.6" cy="9.8" r="1.7" />
    <path d="M3.6 16.5 9 11.9l4.2 3.6 3.2-2.6 4 3.8" />
  </Svg>
);

export const IconExit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.4 3.6H5.6a1 1 0 0 0-1 1v14.8a1 1 0 0 0 1 1h8.8" />
    <path d="M10.6 12h9.8M17 8.4l3.4 3.6-3.4 3.6" />
  </Svg>
);

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.8 5.8l12.4 12.4M18.2 5.8 5.8 18.2" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 6.9V12l3.4 2.1" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.4 3.6v4.8h-4.8" />
  </Svg>
);

/* ---- Decorative marks, used sparingly ---- */

export function Sparkle({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 1.6c.9 5.6 2.9 8 8.4 9-5.5 1-7.5 3.4-8.4 9-.9-5.6-2.9-8-8.4-9 5.5-1 7.5-3.4 8.4-9Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** The brand mark: a chunky retro point-and-shoot. */
export function CameraMark({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size * 0.78}
      viewBox="0 0 120 94"
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <g stroke="#111" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M6 26h20l7-11h32l7 11h42a4 4 0 0 1 4 4v52a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V30a4 4 0 0 1 4-4Z" fill="var(--accent)" />
        <circle cx="60" cy="55" r="22" fill="#FFFDF7" />
        <circle cx="60" cy="55" r="13.5" fill="#111" />
        <circle cx="55.5" cy="50" r="4" fill="#FFFDF7" stroke="none" />
        <rect x="90" y="32" width="16" height="9" rx="2.5" fill="#F28BA8" />
        <path d="M16 36h14" />
      </g>
      {/* flash sparks */}
      <g stroke="#111" strokeWidth="3" strokeLinecap="round">
        <path d="M104 12l6-8M112 24l9-3M97 21l-3-9" />
      </g>
    </svg>
  );
}
