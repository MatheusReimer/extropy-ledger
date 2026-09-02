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

/**
 * A glyph per predefined category.
 *
 * Colour was the obvious way to give categories identity, and it did not survive
 * testing: two candidate palettes were run through a colour-vision validator and
 * both failed - five hues read as grey, and one adjacent pair sat at
 * deuteranopia deltaE 3.9. Eleven categories also overruns the eight slots past
 * which no categorical palette stays separable.
 *
 * Shape has none of those limits. It reads identically to every viewer, survives
 * greyscale printing, and works at 14px in a table cell where a colour swatch
 * would just be a dot. Font Awesome supplies the shapes now, rendered the same
 * runtime-free way as `icons.tsx` - see the note there.
 */
type Props = Omit<SVGProps<SVGSVGElement>, 'children'> & { name: string; size?: number };

const ICONS: Record<string, IconDefinition> = {
  groceries: faBasketShopping,
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

/** A custom category has no known shape; a tag is the honest generic. */
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
