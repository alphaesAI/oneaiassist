import React from 'react';

interface BrandLogoProps {
  variant?: 'full' | 'icon' | 'horizontal';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  className?: string;
  theme?: 'light' | 'dark';
}

export function BrandLogo({
  variant = 'horizontal',
  size = 'md',
  showTagline = false,
  className = '',
  theme = 'light',
}: BrandLogoProps) {
  // Dimensions for the icon emblem
  const iconDimensions = {
    sm: 'h-6 w-9',
    md: 'h-7 w-11',
    lg: 'h-9 w-14',
    xl: 'h-14 w-22',
  }[size];

  const titleSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-3xl',
  }[size];

  // SVG Emblem Mark (Waves + Arrow)
  const Emblem = ({ className: emblemClass = '' }: { className?: string }) => (
    <svg
      viewBox="0 0 320 200"
      className={`${iconDimensions} shrink-0 ${emblemClass}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mh-blue-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2AB0EE" />
          <stop offset="100%" stopColor="#0A52B8" />
        </linearGradient>
        <linearGradient id="mh-aqua-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#0E86D4" />
          <stop offset="60%" stopColor="#1CB8DC" />
          <stop offset="100%" stopColor="#6FE6EA" />
        </linearGradient>
      </defs>
      <g transform="translate(10 15)">
        <g fill="none" stroke="url(#mh-blue-grad)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
          <path d="M30 148 C54 146 62 128 62 100 V46 L110 112 L158 46 V92" />
          <path d="M232 46 V120 C232 138 242 148 258 150" />
        </g>
        {/* white separator outline around arrow */}
        <path
          d="M122 150 C142 158 150 132 160 114 C172 94 202 100 228 86 C248 74 262 58 276 40"
          fill="none"
          stroke={theme === 'dark' ? '#0d0f12' : '#FFFFFF'}
          strokeWidth="36"
          strokeLinecap="butt"
        />
        {/* aqua arrow path */}
        <path
          d="M122 150 C142 158 150 132 160 114 C172 94 202 100 228 86 C248 74 262 58 276 40"
          fill="none"
          stroke="url(#mh-aqua-grad)"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <polygon
          points="294,18 292,54 260,28"
          fill="url(#mh-aqua-grad)"
          stroke="url(#mh-aqua-grad)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );

  // Variant 1: Icon only
  if (variant === 'icon') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <Emblem />
      </div>
    );
  }

  // Variant 2: Full vertical logo (emblem on top, MH text, and tagline)
  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <Emblem className="mb-2" />
        <span
          className={`font-extrabold tracking-wider ${
            theme === 'dark' ? 'text-white' : 'text-slate-800'
          } ${titleSizes}`}
        >
          MH
        </span>
        <span
          className={`text-xs font-semibold tracking-wide ${
            theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          Digital Marketing
        </span>
        {showTagline && (
          <span className="mt-1 text-[11px] font-medium tracking-widest text-slate-400 uppercase">
            Grow. Connect. Succeed.
          </span>
        )}
      </div>
    );
  }

  // Variant 3: Horizontal (emblem left, MH and Digital Marketing on right)
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Emblem />
      <div className="flex flex-col leading-tight">
        <span
          className={`font-extrabold tracking-tight ${
            theme === 'dark' ? 'text-white' : 'text-slate-900'
          } ${titleSizes}`}
        >
          MH <span className="font-semibold text-sky-600">Digital Marketing</span>
        </span>
        {showTagline && (
          <span className="text-[10px] font-medium tracking-wider text-slate-400">
            Grow. Connect. Succeed.
          </span>
        )}
      </div>
    </div>
  );
}
