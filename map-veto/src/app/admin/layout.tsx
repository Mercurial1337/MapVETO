// Server component layout that forces dynamic rendering for all admin pages
// This prevents SSR prerendering which would fail without Supabase env vars at build time

import { AdminSidebar } from '@/components/admin/AdminSidebar';

export const dynamic = 'force-dynamic';

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    return <AdminSidebar>{children}</AdminSidebar>;
}
