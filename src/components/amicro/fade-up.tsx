import React from 'react';
import { motion } from 'framer-motion';

interface FadeUpProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  yOffset?: number;
  className?: string;
  // Scroll-triggered by default (fires once when the element scrolls into
  // view, per section, rather than all at once on mount) -- set false to
  // get the original fire-immediately-on-mount behavior instead.
  scrollTriggered?: boolean;
  once?: boolean;
  viewportMargin?: string;
}

export function FadeUp({
  children,
  duration = 0.6,
  delay = 0,
  yOffset = 20,
  className = '',
  scrollTriggered = true,
  once = true,
  viewportMargin = '-10% 0px',
}: FadeUpProps) {
  const transition = {
    duration,
    delay,
    ease: [0.16, 1, 0.3, 1] as const, // easeOutExpo
  };

  if (scrollTriggered) {
    return (
      <motion.div
        initial={{ opacity: 0, y: yOffset }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once, margin: viewportMargin }}
        transition={transition}
        className={className}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
      className={className}
    >
      {children}
    </motion.div>
  );
}
