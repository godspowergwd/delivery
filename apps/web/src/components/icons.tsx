import type { SVGProps } from 'react';

/**
 * Clean line icon set (24x24, stroke = currentColor) used across the whole UI.
 * Icons inherit font-size via width/height 1em and can be resized with classes
 * such as `h-5 w-5`. No emojis are used anywhere in the application.
 */
export type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ------------------------------ navigation ------------------------------ */

export const HomeIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.6V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.6" />
    <path d="M9.5 21v-6h5v6" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.6 16.6 4.4 4.4" />
  </Base>
);

export const CartIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 4h2l2.6 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6" />
    <circle cx="9.5" cy="19.5" r="1.4" />
    <circle cx="17" cy="19.5" r="1.4" />
  </Base>
);

export const ReceiptIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
    <path d="M9.5 8h5" />
    <path d="M9.5 12h5" />
  </Base>
);

export const UserIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Base>
);

export const UsersIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.7a3.2 3.2 0 0 1 0 5.6" />
    <path d="M17.6 14.7a5.5 5.5 0 0 1 2.9 4.8" />
  </Base>
);

export const TruckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 6.5h10.5v9H3z" />
    <path d="M13.5 9.5H17l3 3v3h-6.5" />
    <circle cx="6.75" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
    <path d="M8.35 18h7.05" />
  </Base>
);

export const MapIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
    <path d="M9 4v13" />
    <path d="M15 6.5v13" />
  </Base>
);

export const GridIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </Base>
);

export const PackageIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M4 7.5l8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </Base>
);

export const ChartIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 20.5h17" />
    <path d="M6.5 20.5v-6" />
    <path d="M11 20.5V6.5" />
    <path d="M15.5 20.5v-9" />
    <path d="M20 20.5V9.5" />
  </Base>
);

export const CogIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
  </Base>
);

export const FolderIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4L10.5 7.5h9A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V6.5z" />
  </Base>
);

export const ScrollIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.5 3h8L19 8v13H6.5z" />
    <path d="M14.5 3v5H19" />
    <path d="M9.5 12.5h6" />
    <path d="M9.5 16.5h6" />
  </Base>
);

export const BellIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.6 5.5 1.6 5.5H4.4S6 13.5 6 9.5z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </Base>
);

export const ChefHatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7.5 13.5a4 4 0 1 1 .9-7.9 4.2 4.2 0 0 1 7.2 0 4 4 0 1 1 .9 7.9v5.5h-9z" />
    <path d="M7.5 19.5h9" />
  </Base>
);

export const InboxIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 13.5h4l1.5 2.5h5l1.5-2.5h4" />
    <path d="M4 13.5 6.6 5h10.8L20 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5.5z" />
  </Base>
);

export const FlameIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3s5.2 4.6 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-1.9 1.1-3.4 1.1-3.4s.5 2.1 2 2.1c0-3 2.1-5.6 2.1-7.9z" />
  </Base>
);

export const ClipboardIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4.5h6v2.5H9z" />
    <path d="M8 4.5H6.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1H16" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
  </Base>
);

/* ------------------------------- feedback ------------------------------- */

export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.4 12.4 2.5 2.5 4.7-5.2" />
  </Base>
);

export const XIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const AlertTriangleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4 2.5 20h19L12 4z" />
    <path d="M12 10.5v4" />
    <path d="M12 17.2h.01" />
  </Base>
);

export const InfoIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <path d="M12 7.6h.01" />
  </Base>
);

export const XCircleIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3.2 2" />
  </Base>
);

/* -------------------------------- actions -------------------------------- */

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const MinusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14" />
  </Base>
);

export const TrashIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 6.5h15" />
    <path d="M9 6.5V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8v1.7" />
    <path d="M6.5 6.5 7.3 19a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-12.5" />
    <path d="M10 10.5v5.5M14 10.5v5.5" />
  </Base>
);

export const PencilIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 3z" />
    <path d="m14.5 6.5 3 3" />
  </Base>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
  </Base>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Base>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </Base>
);

export const RefreshIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-2.4-5.9" />
    <path d="M20.5 3.5V10h-6.3" />
  </Base>
);

export const FilterIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5.5h16l-6.2 7.2V19l-3.6-1.8v-4.5L4 5.5z" />
  </Base>
);

export const DownloadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5V15" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </Base>
);

export const PrinterIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 8V4.5h10V8" />
    <path d="M7 17H5a1.5 1.5 0 0 1-1.5-1.5V9.5A1.5 1.5 0 0 1 5 8h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 17h-2" />
    <path d="M7 13.5h10V20H7z" />
  </Base>
);

export const LogOutIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 21H5.5a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 5.5 3H9" />
    <path d="m15.5 17 5-5-5-5" />
    <path d="M20.5 12H9" />
  </Base>
);

/* --------------------------- location / contact --------------------------- */

export const MapPinIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 21s7-6.2 7-11.2A7 7 0 1 0 5 9.8C5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.8" r="2.6" />
  </Base>
);

export const NavigationIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 11 21 3.5 13.5 21l-2.1-7.9L3.5 11z" />
  </Base>
);

export const PhoneIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5.2 4h3.2l1.5 4-2 1.5a12.3 12.3 0 0 0 6.6 6.6l1.5-2 4 1.5v3.2A1.9 1.9 0 0 1 18 20.6 16.6 16.6 0 0 1 3.4 6a1.9 1.9 0 0 1 1.8-2z" />
  </Base>
);

export const StoreIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9.5 5.4 4h13.2L20 9.5" />
    <path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
    <path d="M5.5 12v7a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7" />
    <path d="M10 20v-4.5h4V20" />
  </Base>
);

/* ---------------------------- money / stats ---------------------------- */

export const WalletIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 8A2.5 2.5 0 0 1 6 5.5h10.5A2 2 0 0 1 18.5 7" />
    <path d="M3.5 8v9A2.5 2.5 0 0 0 6 19.5h13a1.5 1.5 0 0 0 1.5-1.5v-3.5" />
    <path d="M20.5 10.5h-4.3a2.25 2.25 0 0 0 0 4.5h4.3v-4.5z" />
  </Base>
);

export const BanknoteIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="6.5" width="18" height="11" rx="1.8" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6.5 9.5h.01M17.5 14.5h.01" />
  </Base>
);

export const TrendingUpIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 17 5-5 3.5 3.5L20 8" />
    <path d="M15 8h5v5" />
  </Base>
);

/* ------------------------------- catalogue ------------------------------- */

export const TagIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 11.5V5A1.5 1.5 0 0 1 5 3.5h6.5L21 13l-8 8-9.5-9.5z" />
    <circle cx="7.75" cy="7.75" r="1.4" />
  </Base>
);

export const ImageIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17 4.7-4.7 3.1 3.1L15 12l4.5 4.5" />
  </Base>
);

export const HeartIcon = (p: IconProps & { filled?: boolean }) => (
  <Base {...p} filled={p.filled}>
    <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 6.6 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />
  </Base>
);

export const SparkleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5z" />
  </Base>
);

export const CameraIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </Base>
);

export const LockIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </Base>
);

