import type { SVGProps } from 'react';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faChartColumn,
  faCircleInfo,
  faDownload,
  faLayerGroup,
  faPencil,
  faReceipt,
  faTableList,
  faUpload,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

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
export const EditIcon = make(faPencil);
export const InfoIcon = make(faCircleInfo);
