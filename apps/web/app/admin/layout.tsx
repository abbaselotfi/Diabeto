import AdminAuthGuard from "../components/admin-auth-guard";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AdminAuthGuard>{children}</AdminAuthGuard>;
}
