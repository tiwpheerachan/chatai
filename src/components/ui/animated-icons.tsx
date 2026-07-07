"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface IconProps {
  size?: number;
  className?: string;
}

/* ─── CHAT — bubble with typing dots ─── */
export function AnimatedChat({ size = 48, className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("", className)} style={{ width: size, height: size }}>
      <path d="M10 12h28a4 4 0 014 4v14a4 4 0 01-4 4H20l-8 6v-6h-2a4 4 0 01-4-4V16a4 4 0 014-4z"
        fill="#6366F1" opacity={0.12} />
      <path d="M10 12h28a4 4 0 014 4v14a4 4 0 01-4 4H20l-8 6v-6h-2a4 4 0 01-4-4V16a4 4 0 014-4z"
        stroke="#6366F1" strokeWidth={2} strokeLinejoin="round" />
      {[18, 24, 30].map((cx, i) => (
        <motion.circle key={cx} cx={cx} cy={23} r={2.4} fill="#6366F1"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }} />
      ))}
    </svg>
  );
}

/* ─── AI — twinkling sparkle with orbiting spark ─── */
export function AnimatedAI({ size = 48, className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("", className)} style={{ width: size, height: size }}>
      <motion.path d="M24 8l3.2 9.6L37 21l-9.8 3.4L24 34l-3.2-9.6L11 21l9.8-3.4L24 8z"
        fill="#8B5CF6" opacity={0.18}
        animate={{ scale: [1, 1.12, 1], rotate: [0, 8, 0] }} style={{ transformOrigin: "24px 21px" }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
      <motion.path d="M24 8l3.2 9.6L37 21l-9.8 3.4L24 34l-3.2-9.6L11 21l9.8-3.4L24 8z"
        stroke="#8B5CF6" strokeWidth={2} strokeLinejoin="round"
        animate={{ scale: [1, 1.06, 1] }} style={{ transformOrigin: "24px 21px" }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
      <motion.circle cx="36" cy="36" r="2" fill="#EC4899"
        animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
      <motion.circle cx="13" cy="34" r="1.4" fill="#6366F1"
        animate={{ scale: [0.6, 1.3, 0.6], opacity: [0.2, 0.9, 0.2] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5, ease: "easeInOut" }} />
    </svg>
  );
}

/* ─── BELL — rings + notification ping ─── */
export function AnimatedBell({ size = 48, className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("", className)} style={{ width: size, height: size }}>
      <motion.g style={{ transformOrigin: "24px 10px" }}
        animate={{ rotate: [0, 12, -10, 8, -6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}>
        <path d="M24 10a10 10 0 0110 10v6l3 5H11l3-5v-6a10 10 0 0110-10z" fill="#F59E0B" opacity={0.14} />
        <path d="M24 10a10 10 0 0110 10v6l3 5H11l3-5v-6a10 10 0 0110-10z" stroke="#F59E0B" strokeWidth={2} strokeLinejoin="round" />
        <path d="M20 36a4 4 0 008 0" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" />
      </motion.g>
      <motion.circle cx="35" cy="13" r="3" fill="#EF4444"
        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
    </svg>
  );
}

/* ─── ROBOT — blinking eyes + antenna pulse ─── */
export function AnimatedRobot({ size = 48, className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("", className)} style={{ width: size, height: size }}>
      <motion.line x1="24" y1="8" x2="24" y2="13" stroke="#06B6D4" strokeWidth={2} strokeLinecap="round" />
      <motion.circle cx="24" cy="7" r="2" fill="#06B6D4"
        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
      <rect x="10" y="14" width="28" height="22" rx="6" fill="#06B6D4" opacity={0.12} />
      <rect x="10" y="14" width="28" height="22" rx="6" stroke="#06B6D4" strokeWidth={2} />
      {[18, 30].map((cx) => (
        <motion.rect key={cx} x={cx - 2.5} y={22} width={5} height={6} rx={2.5} fill="#06B6D4"
          animate={{ scaleY: [1, 0.1, 1] }} style={{ transformOrigin: `${cx}px 25px` }}
          transition={{ duration: 0.25, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }} />
      ))}
      <line x1="20" y1="32" x2="28" y2="32" stroke="#06B6D4" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/* ─── INBOX — tray catching an incoming message ─── */
export function AnimatedInbox({ size = 48, className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("", className)} style={{ width: size, height: size }}>
      <motion.g animate={{ y: [-10, 0], opacity: [0, 1, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", times: [0, 0.4, 1] }}>
        <rect x="17" y="8" width="14" height="10" rx="2" fill="#10B981" opacity={0.18} />
        <path d="M17 10l7 5 7-5" stroke="#10B981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <path d="M10 24h8l2 4h8l2-4h8v10a4 4 0 01-4 4H14a4 4 0 01-4-4V24z" fill="#10B981" opacity={0.12} />
      <path d="M10 24h8l2 4h8l2-4h8v10a4 4 0 01-4 4H14a4 4 0 01-4-4V24z" stroke="#10B981" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export const APP_ANIMATED_ICONS = [
  { name: "Chat", Icon: AnimatedChat },
  { name: "AI", Icon: AnimatedAI },
  { name: "Bell", Icon: AnimatedBell },
  { name: "Robot", Icon: AnimatedRobot },
  { name: "Inbox", Icon: AnimatedInbox },
];
