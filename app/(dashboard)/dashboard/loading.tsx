import { DashboardSkeleton } from '@/components/SkeletonLoader';

/**
 * Dashboard Loading Page
 * 
 * Displays skeleton loaders while dashboard data is being fetched.
 * Prevents layout shift by matching actual component dimensions.
 * 
 */
export default function DashboardLoading() {
    return <DashboardSkeleton />;
}
