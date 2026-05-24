import { DashboardSkeleton } from '@/components/SkeletonLoader';

/**
 * Dashboard Loading Page
 * 
 * Displays skeleton loaders while dashboard data is being fetched.
 * Prevents layout shift by matching actual component dimensions.
 * 
 * Requirements: 1.6, 8.1, 8.2, 8.7
 */
export default function DashboardLoading() {
    return <DashboardSkeleton />;
}
