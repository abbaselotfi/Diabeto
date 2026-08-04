import AdminAuthGuard from "../components/admin-auth-guard";
import AdminNotificationBell from "../components/admin-notification-bell";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminAuthGuard><AdminNotificationBell />{children}</AdminAuthGuard>;
}
