import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface FadeInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  className?: string;
}

export function FadeIn({
  children,
  duration = 0.5,
  delay = 0,
  className = '',
}: FadeInProps) {
  // Honor prefers-reduced-motion: render at full opacity immediately.
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduceMotion ? 0 : duration,
        delay: reduceMotion ? 0 : delay,
        ease: [0.215, 0.61, 0.355, 1], // easeOutCubic
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
