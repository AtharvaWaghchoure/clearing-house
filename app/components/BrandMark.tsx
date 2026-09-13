// The venue's mark: two counter-flowing legs — delivery (→) and payment (←) — clasped by a central
// seam. Bond and cash settle together, or not at all. 180°-rotationally symmetric on purpose. This
// mirrors app/app/icon.svg (the same glyph as the favicon asset); keep the two in sync if it changes.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="brandMark" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#13211f" />
          <stop offset="1" stopColor="#0b1113" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="url(#brandMark)" stroke="#e7edea" strokeOpacity="0.08" />
      {/* bond leg flows right; cash leg is its 180° twin, flowing left */}
      <g stroke="#3fb27f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 12.5H23.5" />
        <path d="M20.4 9.3L23.8 12.5L20.4 15.7" />
        <path d="M25 19.5H8.5" />
        <path d="M11.6 22.7L8.2 19.5L11.6 16.3" />
      </g>
      {/* the bind: both legs clear together, or neither */}
      <path d="M16 9V23" stroke="#e7edea" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
