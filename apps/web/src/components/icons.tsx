import type { SVGProps } from 'react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faChartColumn,
  faDownload,
  faLayerGroup,
  faReceipt,
  faTableList,
  faUpload,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Font Awesome artwork, rendered without the Font Awesome runtime.
 *
 * The obvious wiring - `@fortawesome/react-fontawesome` over
 * `fontawesome-svg-core` - cost 27 KB gzipped, measured, to replace roughly 2 KB
 * of hand-drawn paths. Almost none of that is the icons: tree-shaking kept only
 * the 21 we import. It is the core runtime, which exists for layers, transforms,
 * masking and a DOM watcher that replaces `<i>` tags - none of which this app
 * uses.
 *
 * An icon definition is just `[width, height, ligatures, unicode, path]`, so the
 * path goes straight into an `<svg>` of our own. Same artwork, same package, same
 * updates - without paying for machinery we do not use.
 *
 * These are SOLID icons, because Font Awesome's free tier has no light or thin
 * weight. The set therefore reads heavier than the strokes it replaced.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

const make = (definition: IconDefinition) => {
  const [width, height, , , path] = definition.icon;
  const d = Array.isArray(path) ? path.join(' ') : path;

  return ({ size = 18, ...rest }: IconProps) => (
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
      <path d={d} />
    </svg>
  );
};

export const OverviewIcon = make(faChartColumn);
export const ExpensesIcon = make(faTableList);
export const CategoriesIcon = make(faLayerGroup);
export const UploadIcon = make(faUpload);
export const DownloadIcon = make(faDownload);
export const ReceiptIcon = make(faReceipt);
export const TrendUpIcon = make(faArrowTrendUp);
export const TrendDownIcon = make(faArrowTrendDown);
export const CloseIcon = make(faXmark);
