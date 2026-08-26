/**
 * Rail icons. Inline SVG on a 16px grid, stroke-based, one consistent weight —
 * never an emoji or an icon font (07: the AI-teal marker is the only glyph the
 * product carries, and it is a component).
 *
 * `currentColor` throughout, so a row's colour drives its icon and the disabled
 * and active states need no icon-specific rules.
 */
const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const HomeIcon = (): React.JSX.Element => (
  <svg {...base}>
    <path d="M2.5 7 8 2.5 13.5 7v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
  </svg>
);

export const MatterIcon = (): React.JSX.Element => (
  <svg {...base}>
    <path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.2 1.5h4.8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
  </svg>
);

export const ClockIcon = (): React.JSX.Element => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3.2l2 1.2" />
  </svg>
);

export const LeadIcon = (): React.JSX.Element => (
  <svg {...base}>
    <circle cx="8" cy="6" r="2.4" />
    <path d="M3.5 13c0-2.2 2-3.6 4.5-3.6s4.5 1.4 4.5 3.6" />
  </svg>
);

export const TimeIcon = (): React.JSX.Element => (
  <svg {...base}>
    <rect x="2.5" y="4" width="11" height="9.5" rx="1" />
    <path d="M2.5 7h11M5.5 2.5v3M10.5 2.5v3" />
  </svg>
);

export const ChartIcon = (): React.JSX.Element => (
  <svg {...base}>
    <path d="M3 13V9M8 13V4M13 13v-6" />
  </svg>
);

export const GearIcon = (): React.JSX.Element => (
  <svg {...base}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
  </svg>
);

export const SearchIcon = (): React.JSX.Element => (
  <svg {...base} width={15} height={15}>
    <circle cx="7.2" cy="7.2" r="4.4" />
    <path d="m10.6 10.6 2.6 2.6" />
  </svg>
);

/**
 * The collapse chevrons. Rotated 180° by CSS when the rail is already
 * collapsed, so one glyph serves both directions and the two states cannot
 * drift apart the way two hand-drawn arrows would.
 */
export const ChevronsIcon = (): React.JSX.Element => (
  <svg {...base}>
    <path d="M9.5 4.5 6 8l3.5 3.5" />
    <path d="M13 4.5 9.5 8l3.5 3.5" />
  </svg>
);
