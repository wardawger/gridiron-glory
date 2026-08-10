import { Sun, Cloud, CloudRain, CloudSnow, CloudFog, CloudLightning, Wind, type LucideIcon } from 'lucide-react';

const CONDITION_ICON: Record<string, LucideIcon> = {
  clear: Sun,
  fair: Sun,
  sunny: Sun,
  cloudy: Cloud,
  overcast: Cloud,
  'partly cloudy': Cloud,
  fog: CloudFog,
  mist: CloudFog,
  haze: CloudFog,
  rain: CloudRain,
  'light rain': CloudRain,
  'heavy rain': CloudRain,
  'rain shower': CloudRain,
  'heavy rain shower': CloudRain,
  drizzle: CloudRain,
  thunderstorm: CloudLightning,
  snow: CloudSnow,
  'light snowfall': CloudSnow,
  'heavy snowfall': CloudSnow,
  sleet: CloudSnow,
  hail: CloudSnow,
};

const WIND_THRESHOLD_MPH = 15;

function iconFor(condition: string | null): LucideIcon {
  if (!condition) return Cloud;
  return CONDITION_ICON[condition.toLowerCase()] ?? Cloud;
}

interface WeatherBadgeProps {
  condition: string | null;
  temp: number | null;
  windSpeed: number | null;
  indoors: boolean;
  className?: string;
}

/**
 * Minimal icon + condition (+ temp, + wind flag) badge for a game's weather.
 * CFBD only has real forecasts within roughly a week of kickoff, so this
 * renders nothing for most future games and for dome/indoor venues — there's
 * no meaningful "expected weather" to show, and a null vs. a wrong guess is
 * an easy call.
 */
export function WeatherBadge({ condition, temp, windSpeed, indoors, className = '' }: WeatherBadgeProps) {
  if (indoors) return null;
  if (!condition && temp == null) return null;

  const Icon = iconFor(condition);
  const isWindy = (windSpeed ?? 0) >= WIND_THRESHOLD_MPH;

  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {condition ?? 'Weather'}{temp != null ? `, ${Math.round(temp)}°F` : ''}
      {isWindy && <Wind className="w-3 h-3 flex-shrink-0 ml-0.5" aria-label="Windy" />}
    </span>
  );
}
