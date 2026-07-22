import type { AvatarType } from '../../types';

interface AvatarProps {
  displayName: string;
  avatarType: AvatarType | undefined;
  avatarValue: string | undefined;
  size: number;
  bgClassName?: string;   // background for the 'initial' fallback circle
  textClassName?: string; // text color for the 'initial' fallback circle
  className?: string;
}

/**
 * Renders a member's roster avatar: an uploaded photo, a team logo (on a
 * white backdrop for contrast), a sports emoji, or — by default — a colored
 * circle with their first initial.
 */
export function Avatar({
  displayName, avatarType, avatarValue, size,
  bgClassName = 'bg-field-900', textClassName = 'text-field-400', className = '',
}: AvatarProps) {
  const style = { width: size, height: size };

  if (avatarType === 'emoji' && avatarValue) {
    return (
      <div
        className={`rounded-full ${bgClassName} flex items-center justify-center flex-shrink-0 leading-none ${className}`}
        style={{ ...style, fontSize: size * 0.55 }}
      >
        <span>{avatarValue}</span>
      </div>
    );
  }

  if ((avatarType === 'logo' || avatarType === 'upload') && avatarValue) {
    return (
      <div
        className={`rounded-full bg-white overflow-hidden flex-shrink-0 ring-1 ring-black/5 shadow-sm ${className}`}
        style={style}
      >
        <img
          src={avatarValue}
          alt={displayName}
          className={`w-full h-full ${avatarType === 'logo' ? 'object-contain p-1' : 'object-cover'}`}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full ${bgClassName} flex items-center justify-center font-bold flex-shrink-0 ${textClassName} ${className}`}
      style={{ ...style, fontSize: size * 0.42 }}
    >
      {displayName?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}
