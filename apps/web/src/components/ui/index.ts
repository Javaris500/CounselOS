/**
 * The canonical primitives (.team-5/shared/pattern-registry.md).
 *
 * If an element you need is here, USE IT — you may not build your own. If it is
 * not here, build it and register it in the same commit. Two implementations of
 * the same element across slices is the failure the registry exists to prevent,
 * and it is invisible in review because each one looks reasonable alone.
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Spinner } from './Spinner';
export { Skeleton, type SkeletonProps } from './Skeleton';
export {
  EmptyState,
  type EmptyStateProps,
  type EmptyStateKind,
  type EmptyStateLayout,
} from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { AiMarker, type AiMarkerProps } from './AiMarker';
export { Dialog, type DialogProps } from './Dialog';
export { Drawer, type DrawerProps } from './Drawer';
export { Table, type Column, type TableProps } from './Table';
export { ToastProvider, useToast, type ToastMessage } from './Toast';
export { useZodForm, applyServerErrors, Field, type FieldProps } from './Form';
export { Card, type CardProps } from './Card';
export { Tabs, type TabItem, type TabsProps } from './Tabs';
export { Select, type SelectOption, type SelectProps } from './Select';
export { Tooltip, type TooltipProps } from './Tooltip';
export { Breadcrumbs, type Crumb } from './Breadcrumbs';
