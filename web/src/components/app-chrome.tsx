"use client";

import { usePathname } from "next/navigation";
import AppTopbar from "./app-topbar";
import AppIconRail from "./app-iconrail";
import AppSidebar from "./app-sidebar";
import AppAssistant from "./app-assistant";
import StopImpersonatingButton from "@/app/stop-impersonating-button";

// Routes that render without the app shell (unauthenticated / full-bleed).
const BARE = ["/login", "/signup", "/verify", "/onboarding", "/setup", "/accept-invitation"];

export default function AppChrome({
  authed,
  user,
  workspaceName,
  role,
  canManage,
  instanceAdmin,
  impersonating,
  children,
}: {
  authed: boolean;
  user: { name: string; email: string };
  workspaceName: string;
  role: string | null;
  canManage: boolean;
  instanceAdmin: boolean;
  impersonating: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare = !authed || BARE.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (bare) return <>{children}</>;
  // Sections that render their own contextual sidebar (so we skip the generic one).
  const selfSidebar = pathname === "/wiki" || pathname.startsWith("/wiki/");

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-neutral-50 text-neutral-900">
      <AppTopbar workspaceName={workspaceName} user={user} />
      {impersonating && (
        <div className="bg-amber-100 px-6 py-2 text-center text-sm text-amber-900">
          You&apos;re impersonating <strong>{user.email}</strong>. <StopImpersonatingButton />
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <AppIconRail instanceAdmin={instanceAdmin} />
        {!selfSidebar && <AppSidebar user={user} role={role} canManage={canManage} />}
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
        <AppAssistant />
      </div>
    </div>
  );
}
