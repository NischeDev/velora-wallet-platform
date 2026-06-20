import type { ReactNode } from 'react';

interface IconProps {
  name:
    | 'arrow-down'
    | 'arrow-up'
    | 'arrow-right'
    | 'bank'
    | 'bell'
    | 'building'
    | 'check'
    | 'chevron-left'
    | 'chevron-right'
    | 'close'
    | 'copy'
    | 'eye'
    | 'eye-off'
    | 'logout'
    | 'search'
    | 'plus'
    | 'refresh'
    | 'send'
    | 'shield'
    | 'timeline'
    | 'users'
    | 'wallet';
  size?: number;
}

const paths: Record<IconProps['name'], ReactNode> = {
  'arrow-down': (
    <>
      <path d="M12 3v15" />
      <path d="m6 12 6 6 6-6" />
    </>
  ),
  'arrow-up': (
    <>
      <path d="M12 21V6" />
      <path d="m18 12-6-6-6 6" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  bank: (
    <>
      <path d="m3 10 9-6 9 6" />
      <path d="M5 10h14" />
      <path d="M7 10v7" />
      <path d="M12 10v7" />
      <path d="M17 10v7" />
      <path d="M4 20h16" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V4h11v17" />
      <path d="M15 9h5v12" />
      <path d="M8 8h3" />
      <path d="M8 12h3" />
      <path d="M8 16h3" />
      <path d="M2 21h20" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 4.2A9.5 9.5 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.1 3.2" />
      <path d="M6.6 6.6C3.7 8.5 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 4.1-.9" />
    </>
  ),
  logout: (
    <>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9" />
      <path d="M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  timeline: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <path d="M5 8v8" />
      <path d="M9 6h11" />
      <path d="M9 18h11" />
      <path d="M12 12h8" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6" />
      <path d="M16 14h1" />
    </>
  ),
};

export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
