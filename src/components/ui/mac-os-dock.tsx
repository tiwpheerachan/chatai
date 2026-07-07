'use client';

import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface DockApp {
  id: string;
  name: string;
  icon: string;
}

interface MacOSDockProps {
  apps: DockApp[];
  onAppClick: (appId: string) => void;
  openApps?: string[];
  className?: string;
  baseIconSize?: number;
  maxScale?: number;
  circular?: boolean;
}

/**
 * Lightweight macOS-style magnifying dock.
 *
 * Pure render-time math + CSS transitions (no requestAnimationFrame / setState
 * loop) so it can't trigger a render loop. Transparent — no dock background.
 * Icons are circular and grow toward the cursor.
 */
const MacOSDock: React.FC<MacOSDockProps> = ({
  apps,
  onAppClick,
  openApps = [],
  className = '',
  baseIconSize = 40,
  maxScale = 1.85,
  circular = true,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const gap = Math.max(6, baseIconSize * 0.3);
  const effect = baseIconSize * 2.6;

  const scaleFor = (centerX: number) => {
    if (hoverX === null) return 1;
    const d = Math.abs(hoverX - centerX);
    if (d > effect) return 1;
    const t = (1 + Math.cos((d / effect) * Math.PI)) / 2; // 1 at cursor → 0 at edge
    return 1 + t * (maxScale - 1);
  };

  return (
    <div
      ref={rowRef}
      className={cn('flex items-end', className)}
      style={{ gap }}
      onMouseMove={(e) => {
        const r = rowRef.current?.getBoundingClientRect();
        if (r) setHoverX(e.clientX - r.left);
      }}
      onMouseLeave={() => setHoverX(null)}
    >
      {apps.map((app, i) => {
        const center = i * (baseIconSize + gap) + baseIconSize / 2;
        const scale = scaleFor(center);
        const open = openApps.includes(app.id);
        return (
          <button
            key={app.id}
            type="button"
            title={app.name}
            onClick={() => onAppClick(app.id)}
            className="relative shrink-0 flex items-end justify-center"
            style={{ width: baseIconSize, height: baseIconSize }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={app.icon}
              alt={app.name}
              className={cn('object-cover bg-white', circular ? 'rounded-full' : 'rounded-[22%]')}
              style={{
                width: baseIconSize,
                height: baseIconSize,
                transform: `scale(${scale})`,
                transformOrigin: 'bottom center',
                transition: 'transform 0.16s ease-out',
                filter: scale > 1.05 ? 'drop-shadow(0 6px 10px rgba(0,0,0,0.18))' : undefined,
              }}
            />
            {open && (
              <span
                className="absolute left-1/2 -translate-x-1/2 rounded-full bg-brand-500"
                style={{ bottom: -7, width: 4, height: 4 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default MacOSDock;
