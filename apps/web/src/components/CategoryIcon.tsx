import type { SVGProps } from 'react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  faBagShopping,
  faBasketShopping,
  faBolt,
  faBus,
  faFilm,
  faGraduationCap,
  faHeartPulse,
  faHouse,
  faPlaneUp,
  faTag,
  faUtensils,
} from '@fortawesome/free-solid-svg-icons';

type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { name: string; size?: number };

const ICONS: Record<string, IconDefinition> = {
  food: faBasketShopping,
  dining: faUtensils,
  transport: faBus,
  housing: faHouse,
  utilities: faBolt,
  health: faHeartPulse,
  entertainment: faFilm,
  shopping: faBagShopping,
  travel: faPlaneUp,
  education: faGraduationCap,
  other: faTag,
};

const CUSTOM = faTag;

export function CategoryIcon({ name, size = 16, ...rest }: Props) {
  const definition = ICONS[name.trim().toLowerCase()] ?? CUSTOM;
  const [width, height, , , path] = definition.icon;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${width} ${height}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
      {...rest}
    >
      <path d={Array.isArray(path) ? path.join(' ') : path} />
    </svg>
  );
}
