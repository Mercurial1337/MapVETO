// Shown inside the admin layout while the next admin page loads, so sidebar clicks respond immediately.
export default function AdminLoading() {
    return (
        <div role="status" aria-label="Loading" className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-white/20 border-t-purple-500 rounded-full animate-spin" />
        </div>
    );
}
