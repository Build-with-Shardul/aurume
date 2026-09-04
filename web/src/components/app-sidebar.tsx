"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/app/sign-out-button";

type NavItem = { href: string; label: string };

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
      }`}
    >
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function projectSections(id: string): NavItem[] {
  return [
    { href: `/projects/${id}`, label: "Overview" },
    { href: `/projects/${id}/plan`, label: "Plan & schedule" },
    { href: `/projects/${id}/knowledge`, label: "Knowledge" },
    { href: `/projects/${id}/features`, label: "Features & playbook" },
    { href: `/projects/${id}/figma`, label: "Design → code" },
    { href: `/projects/${id}/tdd`, label: "Tech design doc" },
    { href: `/projects/${id}/epics`, label: "Epics & stories" },
    { href: `/projects/${id}/tests`, label: "Test cases" },
    { href: `/projects/${id}/settings`, label: "Settings" },
  ];
}

export default function AppSidebar({
  user,
  role,
  canManage,
}: {
  user: { name: string; email: string };
  role: string | null;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("aurume.sidebar") === "1") setCollapsed(true);
    } catch { /* ignore */ }
  }, []);
  const toggle = () =>
    setCollapsed((c) => { const n = !c; try { localStorage.setItem("aurume.sidebar", n ? "1" : "0"); } catch { /* ignore */ } return n; });

  const projMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projMatch && projMatch[1] !== "new" ? projMatch[1] : null;

  const section = pathname.startsWith("/knowledge")
    ? "wiki"
    : pathname.startsWith("/resources")
      ? "resources"
      : pathname.startsWith("/usage")
        ? "ai"
        : pathname.startsWith("/settings") || pathname.startsWith("/admin")
          ? "settings"
          : "projects";
  const title = { projects: "Projects", wiki: "Wiki", resources: "Resources", ai: "AI", settings: "Settings" }[section];

  const exact = (href: string) => pathname === href;
  const within = (href: string) => pathname === href || pathname.startsWith(href + "/");

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col items-center border-r border-neutral-200 bg-white py-3">
        <button onClick={toggle} title="Expand panel" aria-label="Expand panel" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">»</button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
        <button onClick={toggle} title="Collapse panel" aria-label="Collapse panel" className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">«</button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {section === "projects" && (
          <>
            <NavLink item={{ href: "/projects", label: "All projects" }} active={exact("/projects")} />
            {projectId && (
              <div className="mt-2">
                <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">This project</div>
                {projectSections(projectId).map((s) => (
                  <NavLink key={s.href} item={s} active={s.href === `/projects/${projectId}` ? exact(s.href) : within(s.href)} />
                ))}
              </div>
            )}
          </>
        )}

        {section === "wiki" && (
          <>
            <button type="button" disabled title="Coming soon" className="mb-1 flex w-full items-center justify-between rounded-lg border border-dashed border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-400">
              + New page <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px]">Soon</span>
            </button>
            <NavLink item={{ href: "/knowledge", label: "Home" }} active={exact("/knowledge")} />
            <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Knowledge</div>
            <NavLink item={{ href: "/knowledge", label: "All documents" }} active={within("/knowledge")} />
          </>
        )}

        {section === "resources" && <NavLink item={{ href: "/resources", label: "Overview" }} active={within("/resources")} />}

        {section === "ai" && (
          <>
            <NavLink item={{ href: "/usage", label: "Usage" }} active={within("/usage")} />
            <p className="px-2.5 pt-3 text-xs text-neutral-400">Ask Aurume is on the right →</p>
          </>
        )}

        {section === "settings" && (
          <>
            <NavLink item={{ href: "/settings/profile", label: "Profile" }} active={within("/settings/profile")} />
            <NavLink item={{ href: "/settings/role", label: "My role" }} active={within("/settings/role")} />
            <NavLink item={{ href: "/settings/connectors", label: "Connectors" }} active={within("/settings/connectors")} />
            {canManage && <NavLink item={{ href: "/admin/people", label: "Manage people" }} active={within("/admin/people")} />}
          </>
        )}
      </nav>

      <div className="border-t border-neutral-100 p-3">
        <div className="mb-2 min-w-0 px-1">
          <div className="truncate text-sm font-medium text-neutral-800">{user.name || user.email}</div>
          {role && <div className="truncate text-xs capitalize text-neutral-400">{role}</div>}
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
