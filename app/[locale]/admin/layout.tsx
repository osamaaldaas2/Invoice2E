import AdminProtectedRoute from '@/components/admin/AdminProtectedRoute';
import AdminLayout from '@/components/admin/AdminLayout';

export default function AdminRootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AdminProtectedRoute>
            <AdminLayout>{children}</AdminLayout>
        </AdminProtectedRoute>
    );
}
