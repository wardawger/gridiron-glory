import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

interface TiltCardProps {
  children: React.ReactNode;
  maxTilt?: number;
  className?: string;
  cardClassName?: string;
}

export function TiltCard({
  children,
  maxTilt = 15,
  className = '',
  cardClassName = '',
}: TiltCardProps) {
  // Measured once per hover rather than on every mousemove — reading
  // getBoundingClientRect in the move handler forces a layout on each event.
  const rectRef = useRef<DOMRect | null>(null);
  const reduceMotion = useReducedMotion();

  // Motion values for x/y mouse offset relative to card center (-0.5 to 0.5)
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Springs for smooth movement
  const springConfig = { damping: 20, stiffness: 200, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [maxTilt, -maxTilt]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-maxTilt, maxTilt]), springConfig);

  // Purely decorative on a non-interactive card, so under
  // prefers-reduced-motion it's dropped rather than softened.
  if (reduceMotion) {
    return (
      <div className={`relative ${className}`}>
        <div className={`w-full h-full ${cardClassName}`}>{children}</div>
      </div>
    );
  }

  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    rectRef.current = event.currentTarget.getBoundingClientRect();
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = rectRef.current;
    if (!rect) return;
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    rectRef.current = null;
    x.set(0);
    y.set(0);
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative ${className}`}
      style={{ perspective: '800px' }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className={`w-full h-full ${cardClassName}`}
      >
        <div style={{ transform: 'translateZ(24px)', transformStyle: 'preserve-3d' }} className="w-full h-full">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
