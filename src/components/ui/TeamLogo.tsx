// Fallback initials avatar — solid white to blend into the TeamLogo chip below
export function teamLogoFallbackUrl(name: string): string {
  const initials = name
    .replace(/[^a-zA-Z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=ffffff&color=166534&bold=true&size=80&font-size=0.4`;
}

interface TeamLogoProps {
  src: string | null | undefined;
  alt: string;
  fallbackName: string;
  size: number;
  className?: string;
}

/**
 * White chip behind every team logo so dark/thin marks stay visible on the
 * dark theme. Corner radius scales with size, capped at the card radius
 * (rounded-xl / 12px) so nothing reads rounder than a .card.
 */
export function TeamLogo({ src, alt, fallbackName, size, className = '' }: TeamLogoProps) {
  const radius  = size <= 20 ? 5 : size <= 30 ? 7 : size < 44 ? 8 : 12;
  const padding = Math.max(0, Math.round(size * 0.12));

  return (
    <div
      className={`bg-white shadow-sm ring-1 ring-black/5 flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: radius, padding }}
    >
      <img
        src={src || teamLogoFallbackUrl(fallbackName)}
        alt={alt}
        className="w-full h-full object-contain"
        onError={e => { (e.target as HTMLImageElement).src = teamLogoFallbackUrl(fallbackName); }}
      />
    </div>
  );
}
