/**
 * The canonical primitives (.team-5/shared/pattern-registry.md).
 *
 * If an element you need is here, USE IT — you may not build your own. If it is
 * not here, build it and register it in the same commit. Two implementations of
 * the same element across slices is the failure the registry exists to prevent,
 * and it is invisible in review because each one looks reasonable alone.
 */
export { Button, type ButtonProps, type ButtonVariant } from './Button';
export { Spinner } from './Spinner';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { AiMarker, type AiMarkerProps } from './AiMarker';
export { Dialog, type DialogProps } from './Dialog';
export { Drawer, type DrawerProps } from './Drawer';
export { Table, type Column, type TableProps } from './Table';
export { ToastProvider, useToast, type ToastMessage } from './Toast';
export { useZodForm, applyServerErrors, Field, type FieldProps } from './Form';
