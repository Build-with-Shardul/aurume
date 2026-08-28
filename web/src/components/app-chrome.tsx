"use client";

import { usePathname } from "next/navigation";
import AppSidebar from "./app-sidebar";

// Routes that render without the app shell (unauthenticated / full-bleed).
const BARE = ["/login", "/setup", "/accept-invitation"];

export default function AppChrome({
  authed,
  user,
  role,
  canManage,
  instanceAdmin,
  children,
}: {
  authed: boolean;
  user: { name: string; email: string };
  role: string | null;
  canManage: boolean;
  instanceAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare = !authed || BARE.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (bare) return <>{children}</>;
  return (
    <div className="flex min-h-screen w-full bg-neutral-50 text-neutral-900">
      <AppSidebar user={user} role={role} canManage={canManage} instanceAdmin={instanceAdmin} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
