/**
 * The components layer's public surface.
 *
 * Pages import from here rather than reaching into individual files, so the
 * boundary is one line to read and moving or renaming a component is a change
 * inside this directory instead of a change in every page that used it.
 *
 * Sub-components that only exist to serve one parent (`BudgetRow`, `CategoryIcon`)
 * are deliberately absent: exporting them would invite use from outside, which is
 * exactly the coupling this file is meant to prevent.
 */
export { Brand, BrandMark } from './Brand';
export { CategoryCard } from './CategoryCard';
export { CategoryManager } from './CategoryManager';
export { ExpenseForm } from './ExpenseForm';
export { ExpenseTable } from './ExpenseTable';
export { ExportButton } from './ExportButton';
export { FirstRun } from './FirstRun';
export { Panel, PanelHeading } from './Panel';
export { Preferences } from './Preferences';
export { ReceiptDropzone } from './ReceiptDropzone';
export { ReceiptViewer } from './ReceiptViewer';
export { SavedExpense } from './SavedExpense';
export { Segmented } from './Segmented';
export { SpendingChart } from './SpendingChart';
export { StatCard, StatRow, toDelta, type Delta } from './StatCard';
export { TrendChart } from './TrendChart';
export { EmptyState, ErrorState, LoadingState } from './StateViews';
export { Rise, useCountUp } from './motion';
