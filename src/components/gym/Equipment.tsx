import { useId } from "react";
import { cn } from "@/lib/format";

/*
 * Gym equipment illustrations in a soft 3D style: each piece has a light source top-left,
 * a body gradient, a rim highlight and a contact shadow, so they sit naturally on the ember background.
 * Decorative only (aria-hidden).
 */

export function Dumbbell({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 260 120" className={cn("overflow-visible", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4A4458" />
          <stop offset="0.5" stopColor="#2A2438" />
          <stop offset="1" stopColor="#15111F" />
        </linearGradient>
        <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F4F1F7" />
          <stop offset="0.45" stopColor="#B9B3C4" />
          <stop offset="1" stopColor="#6E6680" />
        </linearGradient>
        <linearGradient id={`${id}-grip`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB27A" />
          <stop offset="1" stopColor="#E04A00" />
        </linearGradient>
      </defs>
      <ellipse cx="130" cy="112" rx="110" ry="6" fill="#7A2700" opacity="0.25" />
      {/* bar */}
      <rect x="20" y="52" width="220" height="16" rx="8" fill={`url(#${id}-bar)`} />
      {/* knurled grip */}
      <rect x="92" y="49" width="76" height="22" rx="11" fill={`url(#${id}-grip)`} />
      {[100, 110, 120, 130, 140, 150, 160].map((x) => (
        <line key={x} x1={x} x2={x} y1="52" y2="68" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
      ))}
      {/* plates, outer to inner */}
      {[
        { x: 22, w: 22, h: 104 },
        { x: 46, w: 20, h: 84 },
        { x: 194, w: 20, h: 84 },
        { x: 216, w: 22, h: 104 },
      ].map((p) => (
        <g key={p.x}>
          <rect x={p.x} y={60 - p.h / 2} width={p.w} height={p.h} rx="8" fill={`url(#${id}-plate)`} />
          <rect x={p.x + 3} y={60 - p.h / 2 + 4} width="4" height={p.h - 8} rx="2" fill="#FFFFFF" opacity="0.18" />
        </g>
      ))}
      {/* collars */}
      <rect x="68" y="46" width="10" height="28" rx="4" fill={`url(#${id}-bar)`} />
      <rect x="182" y="46" width="10" height="28" rx="4" fill={`url(#${id}-bar)`} />
    </svg>
  );
}

export function Kettlebell({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 160 180" className={cn("overflow-visible", className)} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-body`} cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#5A536A" />
          <stop offset="0.55" stopColor="#2A2438" />
          <stop offset="1" stopColor="#120E1B" />
        </radialGradient>
        <linearGradient id={`${id}-handle`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4A4458" />
          <stop offset="1" stopColor="#1E1A2A" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="172" rx="56" ry="7" fill="#7A2700" opacity="0.25" />
      <path d="M44 74 C38 18 122 18 116 74" fill="none" stroke={`url(#${id}-handle)`} strokeWidth="18" strokeLinecap="round" />
      <path d="M50 66 C48 32 112 32 110 66" fill="none" stroke="#fff" strokeOpacity="0.15" strokeWidth="3" strokeLinecap="round" />
      <circle cx="80" cy="112" r="58" fill={`url(#${id}-body)`} />
      <ellipse cx="60" cy="88" rx="18" ry="11" fill="#fff" opacity="0.14" transform="rotate(-30 60 88)" />
      {/* weight label */}
      <rect x="58" y="106" width="44" height="26" rx="13" fill="#FC5200" />
      <text x="80" y="124" textAnchor="middle" fontFamily="Big Shoulders Display, Impact, sans-serif" fontWeight="800" fontSize="16" fill="#fff">
        16 KG
      </text>
    </svg>
  );
}

export function WeightPlate({ className, label = "20" }: { className?: string; label?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 200" className={cn("overflow-visible", className)} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-rubber`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#4A4458" />
          <stop offset="0.6" stopColor="#221D30" />
          <stop offset="1" stopColor="#100C18" />
        </radialGradient>
        <linearGradient id={`${id}-hub`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4F1F7" />
          <stop offset="1" stopColor="#8D869C" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill={`url(#${id}-rubber)`} />
      <circle cx="100" cy="100" r="80" fill="none" stroke="#FC5200" strokeWidth="7" />
      <circle cx="100" cy="100" r="62" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="2" />
      <circle cx="100" cy="100" r="30" fill={`url(#${id}-hub)`} />
      <circle cx="100" cy="100" r="14" fill="#1A1626" />
      <text x="100" y="56" textAnchor="middle" fontFamily="Big Shoulders Display, Impact, sans-serif" fontWeight="800" fontSize="20" fill="#fff" opacity="0.9">
        {label} KG
      </text>
      <path d="M38 64 A72 72 0 0 1 86 30" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Stopwatch({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 140 160" className={cn("overflow-visible", className)} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-case`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E3DCEA" />
        </radialGradient>
      </defs>
      <ellipse cx="70" cy="154" rx="44" ry="5" fill="#7A2700" opacity="0.22" />
      <rect x="58" y="4" width="24" height="16" rx="5" fill="#2A2438" />
      <rect x="98" y="26" width="16" height="12" rx="4" fill="#2A2438" transform="rotate(40 106 32)" />
      <circle cx="70" cy="88" r="62" fill={`url(#${id}-case)`} />
      <circle cx="70" cy="88" r="50" fill="#FFF8F2" stroke="#F0E8F3" strokeWidth="3" />
      <path d="M70 88 L70 38 A50 50 0 0 1 117 104 Z" fill="#FC5200" opacity="0.9" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={70 + Math.sin(a) * 42} y1={88 - Math.cos(a) * 42} x2={70 + Math.sin(a) * 47} y2={88 - Math.cos(a) * 47} stroke="#2A2438" strokeWidth="3" strokeLinecap="round" />;
      })}
      <circle cx="70" cy="88" r="6" fill="#2A2438" />
      <ellipse cx="46" cy="58" rx="14" ry="8" fill="#fff" opacity="0.8" transform="rotate(-35 46 58)" />
    </svg>
  );
}
