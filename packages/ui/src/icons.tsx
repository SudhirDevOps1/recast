/** Minimal inline icon set — 1.5 px strokes, no emoji anywhere. */

import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconRecord = (p: P) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={6} fill="currentColor" stroke="none" />
  </Base>
);

export const IconStop = (p: P) => (
  <Base {...p}>
    <rect x={7} y={7} width={10} height={10} rx={1.5} fill="currentColor" stroke="none" />
  </Base>
);

export const IconPause = (p: P) => (
  <Base {...p}>
    <rect x={8} y={7} width={3} height={10} rx={1} fill="currentColor" stroke="none" />
    <rect x={13} y={7} width={3} height={10} rx={1} fill="currentColor" stroke="none" />
  </Base>
);

export const IconPlay = (p: P) => (
  <Base {...p}>
    <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" stroke="none" />
  </Base>
);

export const IconScissors = (p: P) => (
  <Base {...p}>
    <circle cx={6} cy={6} r={2.5} />
    <circle cx={6} cy={18} r={2.5} />
    <path d="M8.2 7.8 20 18M8.2 16.2 20 6" />
  </Base>
);

export const IconZoom = (p: P) => (
  <Base {...p}>
    <circle cx={11} cy={11} r={6} />
    <path d="m20 20-3.5-3.5M8.5 11h5M11 8.5v5" />
  </Base>
);

export const IconCursor = (p: P) => (
  <Base {...p}>
    <path d="M6 4.5 17.5 12l-5 1.2L10 18.5 6 4.5Z" />
  </Base>
);

export const IconMic = (p: P) => (
  <Base {...p}>
    <rect x={9.5} y={3.5} width={5} height={9} rx={2.5} />
    <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3" />
  </Base>
);

export const IconSpeaker = (p: P) => (
  <Base {...p}>
    <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Base>
);

export const IconCamera = (p: P) => (
  <Base {...p}>
    <rect x={3.5} y={6.5} width={12} height={11} rx={2.5} />
    <path d="m15.5 10.5 5-3v9l-5-3" />
  </Base>
);

export const IconFilm = (p: P) => (
  <Base {...p}>
    <rect x={3.5} y={5} width={17} height={14} rx={2} />
    <path d="M7.5 5v14M16.5 5v14M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4" />
  </Base>
);

export const IconFolder = (p: P) => (
  <Base {...p}>
    <path d="M3.5 7.5v11a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-9a1.5 1.5 0 0 0-1.5-1.5H11L9 5.5H5a1.5 1.5 0 0 0-1.5 1.5v1.5" />
  </Base>
);

export const IconSettings = (p: P) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={3} />
    <path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.8-1.6L13.3 2h-2.6l-.4 2.9a7 7 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .5.1 1.1.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.8 1.6l.4 2.9h2.6l.4-2.9a7 7 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.1-.5.2-1.1.2-1.6Z" />
  </Base>
);

export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M5 7h14M10 4.5h4M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17 7M10 10.5v6M14 10.5v6" />
  </Base>
);

export const IconDownload = (p: P) => (
  <Base {...p}>
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19.5h14" />
  </Base>
);

export const IconUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 15V4m0 0 4 4m-4-4-4 4M5 19.5h14" />
  </Base>
);

export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

export const IconX = (p: P) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconWarning = (p: P) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19L12 4Z" />
    <path d="M12 10v4.5M12 17.2v.1" />
  </Base>
);

export const IconSparkle = (p: P) => (
  <Base {...p}>
    <path d="M12 4.5 13.8 10 19 12l-5.2 2-1.8 5.5L10.2 14 5 12l5.2-2L12 4.5Z" />
  </Base>
);

export const IconText = (p: P) => (
  <Base {...p}>
    <path d="M5 7V5h14v2M12 5v14M9 19h6" />
  </Base>
);

export const IconCommand = (p: P) => (
  <Base {...p}>
    <path d="M9 9V6.5a2.5 2.5 0 1 0-2.5 2.5H9Zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15Zm0 0v6m0 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15Zm-6 0H6.5A2.5 2.5 0 1 0 9 17.5V15Zm0 0h6" />
  </Base>
);

export const IconLayers = (p: P) => (
  <Base {...p}>
    <path d="m12 3.5 8.5 5L12 13.5l-8.5-5 8.5-5ZM3.5 12.5l8.5 5 8.5-5M3.5 16.5l8.5 5 8.5-5" />
  </Base>
);

export const IconEye = (p: P) => (
  <Base {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx={12} cy={12} r={3} />
  </Base>
);

export const IconMonitor = (p: P) => (
  <Base {...p}>
    <rect x={3} y={4.5} width={18} height={12} rx={2} />
    <path d="M9 20h6M12 16.5V20" />
  </Base>
);

export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M4 10a8 8 0 0 1 14-3.5M20 14a8 8 0 0 1-14 3.5M18 3v4h-4M6 21v-4h4" />
  </Base>
);

export const IconKeyframe = (p: P) => (
  <Base {...p}>
    <path d="M12 4.5 19.5 12 12 19.5 4.5 12 12 4.5Z" fill="currentColor" fillOpacity={0.18} />
  </Base>
);

export const IconWaveform = (p: P) => (
  <Base {...p}>
    <path d="M4 10.5v3M8 7v10M12 4.5v15M16 8.5v7M20 10.5v3" />
  </Base>
);

export const IconUndo = (p: P) => (
  <Base {...p}>
    <path d="M8 6 4 10l4 4M4 10h10a5 5 0 0 1 0 10h-3" />
  </Base>
);

export const IconRedo = (p: P) => (
  <Base {...p}>
    <path d="m16 6 4 4-4 4M20 10H10a5 5 0 0 0 0 10h3" />
  </Base>
);

export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Base>
);

export const IconMinus = (p: P) => (
  <Base {...p}>
    <path d="M5.5 12h13" />
  </Base>
);

export const IconTarget = (p: P) => (
  <Base {...p}>
    <circle cx={12} cy={12} r={7.5} />
    <circle cx={12} cy={12} r={2.5} fill="currentColor" stroke="none" />
    <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
  </Base>
);

export const IconChevronLeft = (p: P) => (
  <Base {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Base>
);

export const IconChevronRight = (p: P) => (
  <Base {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Base>
);

export const IconMaximize = (p: P) => (
  <Base {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Base>
);

export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx={11} cy={11} r={6.5} />
    <path d="m16 16 4.5 4.5" />
  </Base>
);

export const IconCrop = (p: P) => (
  <Base {...p}>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </Base>
);

export const IconCaptions = (p: P) => (
  <Base {...p}>
    <rect x={3.5} y={5} width={17} height={14} rx={2.5} />
    <path d="M7 15h4M15 15h2M7 11h2M13 11h4" />
  </Base>
);
