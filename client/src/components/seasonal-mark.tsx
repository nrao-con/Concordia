import type { HolidayDecoration } from "@shared/seasonal-theme";

/**
 * Tiny, static inline artwork used as a seasonal accent. It is intentionally
 * decorative and hidden from assistive technology by its containing span.
 */
export function SeasonalMark({ decoration, size = 38 }: { decoration: HolidayDecoration; size?: number }) {
  if (decoration === "pumpkins") {
    return (
      <svg viewBox="0 0 40 50" width={size} height={size * (50 / 40)} fill="none" aria-hidden="true" focusable="false">
        <path d="m3 12 2-3 1.4 2L9 10l-.8 2.5L10 15l-3-.8-2 1.8-.2-2.5L3 12Z" fill="#4E2630" />
        <path d="m31 5 2-3 1.4 2L37 3l-.8 2.5L38 8l-3-.8-2 1.8-.2-2.5L31 5Z" fill="#4E2630" />

        <path d="M20 25c-7.8 0-14.5 4.2-14.5 11.5S11.8 48 20 48s14.5-4.2 14.5-11.5S27.8 25 20 25Z" fill="#E97817" />
        <path d="M20 25c-4.4 3.8-6 8.1-6 11.5 0 4.7 2.3 8.6 6 11.5m0-23c4.4 3.8 6 8.1 6 11.5 0 4.7-2.3 8.6-6 11.5" stroke="#D66312" strokeWidth="1.2" />
        <path d="M20 26c-8.2 0-11.6 5.4-11.6 10.7 0 5.5 3.5 9.4 11.6 9.4s11.6-3.9 11.6-9.4C31.6 31.4 28.2 26 20 26Z" fill="#F28A1E" fillOpacity=".48" />
        <path d="m13 34 4 2-2.2 3.5-3.5-1.2L10 35l3 1 0-2Zm14 0-4 2 2.2 3.5 3.5-1.2L30 35l-3 1 0-2Z" fill="#48262B" />
        <path d="m12 41 4 1 2-2 2 2 2-2 2 2 4-1-1.5 3-4.5 1.5h-4L14 44l-2-3Z" fill="#48262B" />

        <path d="M20 7.5c-7.4 0-12.8 4.1-12.8 10.6S12.2 29.5 20 29.5s12.8-4.9 12.8-11.4S27.4 7.5 20 7.5Z" fill="#F18418" />
        <path d="M20 8c-4.2 3.1-5.7 6.8-5.7 10.1 0 4.3 2 8.2 5.7 11m0-21.1c4.2 3.1 5.7 6.8 5.7 10.1 0 4.3-2 8.2-5.7 11" stroke="#D96813" strokeWidth="1.1" />
        <path d="M20 8c-7.1 0-10.2 4.3-10.2 10.1 0 5.5 3.1 9 10.2 9s10.2-3.5 10.2-9C30.2 12.3 27.1 8 20 8Z" fill="#FFA52D" fillOpacity=".38" />
        <path d="M17 16.4c1.3 0 2.2 1 2.2 2.1 0 .5-.2.9-.5 1.3l-2.8-.1c-.7-.8-.7-1.8-.3-2.5.3-.5.8-.8 1.4-.8Zm6 0c1.3 0 2.2 1 2.2 2.1 0 .5-.2.9-.5 1.3l-2.8-.1c-.7-.8-.7-1.8-.3-2.5.3-.5.8-.8 1.4-.8Z" fill="#FFD84D" />
        <path d="m13.7 21.4 3.1-.4 1.3 1.2 1.9-.5 1.9.5 1.3-1.2 3.1.4-1.4 2.5-3.4 1.6h-3l-3.4-1.6-1.4-2.5Z" fill="#FFD84D" />
        <path d="M19.2 8c-1.2-2.8-.2-5.5 2.5-6.1 1.9-.4 3.6.6 3.9 2.4.3 1.4-.4 2.5-1.7 3.2" stroke="#64804C" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M22.4 8.2c1.5-.5 2.7-.2 3.7.7" stroke="#7C9859" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  const motif = (() => {
    switch (decoration) {
      case "hearts":
        return <><path d="M9 17S3 13 3 8.7C3 5.2 7.4 4 9 7c1.6-3 6-1.8 6 1.7C15 13 9 17 9 17Z" fill="#D98998" /><path d="M28 17s-5-3.5-5-7.1C23 7 26.7 6 28 8.5 29.3 6 33 7 33 9.9c0 3.6-5 7.1-5 7.1Z" fill="#E8A9B3" /></>;
      case "clover":
        return <><g fill="#86A77C"><circle cx="8" cy="8" r="3" /><circle cx="13" cy="8" r="3" /><circle cx="8" cy="13" r="3" /><circle cx="13" cy="13" r="3" /></g><path d="m10.5 13-2 5" stroke="#66815E" strokeWidth="1.5" strokeLinecap="round" /><g fill="#A2B996"><circle cx="27" cy="8" r="2.7" /><circle cx="31.5" cy="8" r="2.7" /><circle cx="27" cy="12.5" r="2.7" /><circle cx="31.5" cy="12.5" r="2.7" /></g><path d="m29.3 12.5-1.8 4.5" stroke="#66815E" strokeWidth="1.3" strokeLinecap="round" /></>;
      case "eggs":
        return <><ellipse cx="10" cy="11" rx="5.2" ry="7" fill="#D8C6A0" /><path d="M5.7 11h8.6M6.5 8.2h7" stroke="#A88C64" strokeWidth="1" /><ellipse cx="28" cy="11" rx="4.6" ry="6.3" fill="#C9D4C1" /><path d="M23.7 12h8.5M24.7 8.8h6.6" stroke="#82957E" strokeWidth="1" /></>;
      case "flags":
        return <><path d="M6 18V4m0 1h10l-2.5 3L16 11H6" stroke="#8F5960" strokeWidth="1.3" strokeLinejoin="round" /><path d="M25 18V5m0 1h9l-2.2 2.7L34 11h-9" stroke="#7589A0" strokeWidth="1.3" strokeLinejoin="round" /></>;
      case "evergreen":
        return <><path d="m9 3-5 7h3l-4 5h12l-4-5h3L9 3Z" fill="#718B79" /><path d="M9 15v4" stroke="#A88467" strokeWidth="1.4" /><path d="m28 4-5 7h3l-4 5h12l-4-5h3l-5-7Z" fill="#8FA394" /><path d="M28 15v4" stroke="#A88467" strokeWidth="1.4" /></>;
      case "stars":
        return <><path d="m9 3 2.1 4.3 4.8.7-3.5 3.4.8 4.8L9 14l-4.2 2.2.8-4.8L2 8l4.9-.7L9 3Z" fill="#D7B86F" /><path d="m28 4 1.8 3.7 4.2.6-3 2.9.7 4.2-3.7-2-3.8 2 .8-4.2-3.1-2.9 4.3-.6L28 4Z" fill="#E5CA8B" /></>;
      case "flowers":
        return <><g fill="#D9A879"><circle cx="9" cy="6" r="2.4" /><circle cx="13" cy="9" r="2.4" /><circle cx="11" cy="14" r="2.4" /><circle cx="6" cy="13" r="2.4" /><circle cx="5" cy="8" r="2.4" /></g><circle cx="9" cy="10" r="2" fill="#88714F" /><g fill="#C59D82"><circle cx="28" cy="6" r="2.2" /><circle cx="32" cy="9" r="2.2" /><circle cx="30" cy="14" r="2.2" /><circle cx="25" cy="13" r="2.2" /><circle cx="24" cy="8" r="2.2" /></g><circle cx="28" cy="10" r="1.8" fill="#88714F" /></>;
      case "harvest":
      case "remembrance":
        return <><path d="M9 18V4m0 4c-3-2-4-4-4-5 3 0 5 2 5 5m-1 3c3-2 4-4 4-5-3 0-5 2-5 5" stroke="#A9926B" strokeWidth="1.3" strokeLinecap="round" /><path d="M28 18V5m0 4c-3-2-4-4-4-5 3 0 5 2 5 5m-1 3c3-2 4-4 4-5-3 0-5 2-5 5" stroke="#9D8669" strokeWidth="1.3" strokeLinecap="round" /></>;
      default:
        return <><circle cx="9" cy="10" r="5" fill="#D8C6A0" /><circle cx="28" cy="10" r="5" fill="#C9D4C1" /></>;
    }
  })();

  return (
    <svg viewBox="0 0 38 22" width={size} height={size * (22 / 38)} fill="none" aria-hidden="true" focusable="false">
      {motif}
    </svg>
  );
}
