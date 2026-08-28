"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/app/sign-out-button";

type NavItem = { href: string; label: string; icon: string };

function NavLink({ item, collapsed, active }: { item: NavItem; collapsed: boolean; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <span className="shrink-0 text-base leading-none">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SubLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2 rounded-md py-1.5 pl-3 pr-2 text-[13px] transition-colors ${
        active ? "font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-900"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-neutral-900" : "bg-neutral-300"}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// Project section sub-nav, in delivery-chain order.
function projectSections(id: string): NavItem[] {
  return [
    { href: `/projects/${id}`, label: "Overview", icon: "•" },
    { href: `/projects/${id}/plan`, label: "Plan & schedule", icon: "•" },
    { href: `/projects/${id}/knowledge`, label: "Knowledge", icon: "•" },
    { href: `/projects/${id}/features`, label: "Features & playbook", icon: "•" },
    { href: `/projects/${id}/figma`, label: "Design → code", icon: "•" },
    { href: `/projects/${id}/tdd`, label: "Tech design doc", icon: "•" },
    { href: `/projects/${id}/epics`, label: "Epics & stories", icon: "•" },
    { href: `/projects/${id}/tests`, label: "Test cases", icon: "•" },
    { href: `/projects/${id}/settings`, label: "Settings", icon: "•" },
  ];
}

export default function AppSidebar({
  user,
  role,
  canManage,
  instanceAdmin,
}: {
  user: { name: string; email: string };
  role: string | null;
  canManage: boolean;
  instanceAdmin: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("aurume.sidebar") === "1") setCollapsed(true);
    } catch { /* ignore */ }
  }, []);
  const toggle = () =>
    setCollapsed((c) => { const n = !c; try { localStorage.setItem("aurume.sidebar", n ? "1" : "0"); } catch { /* ignore */ } return n; });

  const main: NavItem[] = [
    { href: "/projects", label: "Projects", icon: "📁" },
    { href: "/knowledge", label: "Org knowledge", icon: "📚" },
    { href: "/resources", label: "Resources", icon: "🧑‍💻" },
  ];
  const settings: NavItem[] = [
    { href: "/settings/profile", label: "Profile", icon: "👤" },
    { href: "/settings/role", label: "My role", icon: "🛡️" },
    { href: "/settings/connectors", label: "Connectors", icon: "🔌" },
    ...(canManage ? [{ href: "/admin/people", label: "Manage people", icon: "👥" }] : []),
    { href: "/usage", label: "AI usage", icon: "📈" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  // Inside a specific project? (exclude /projects and /projects/new)
  const projMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = projMatch && projMatch[1] !== "new" ? projMatch[1] : null;
  const sections = projectId ? projectSections(projectId) : [];
  const sectionActive = (href: string) => (href === `/projects/${projectId}` ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-150 ${collapsed ? "w-16" : "w-60"}`}>
      <div className="flex items-center justify-between px-3 py-4">
        {!collapsed && <Link href="/" className="px-1 text-lg font-semibold tracking-tight">Aurume</Link>}
        <button onClick={toggle} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title={collapsed ? "Expand" : "Collapse"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        <NavLink item={main[0]} collapsed={collapsed} active={isActive("/projects")} />
        {/* project sub-nav */}
        {!collapsed && projectId && (
          <div className="mb-1 ml-3 space-y-0.5 border-l border-neutral-200 pl-2">
            {sections.map((s) => <SubLink key={s.href} item={s} active={sectionActive(s.href)} />)}
          </div>
        )}
        {main.slice(1).map((it) => <NavLink key={it.href} item={it} collapsed={collapsed} active={isActive(it.href)} />)}

        <div className="pt-3">
          {!collapsed ? (
            <button onClick={() => setSettingsOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-600">
              <span>⚙️</span><span>Settings</span><span className="ml-auto">{settingsOpen ? "▾" : "▸"}</span>
            </button>
          ) : (
            <div className="py-1 text-center text-neutral-300">⚙️</div>
          )}
          {(settingsOpen || collapsed) && (
            <div className={`space-y-1 ${collapsed ? "" : "pl-2"}`}>
              {settings.map((it) => <NavLink key={it.href} item={it} collapsed={collapsed} active={isActive(it.href)} />)}
            </div>
          )}
        </div>

        {instanceAdmin && <div className="pt-2"><NavLink item={{ href: "/superadmin", label: "Platform admin", icon: "🛠️" }} collapsed={collapsed} active={isActive("/superadmin")} /></div>}
      </nav>

      <div className="border-t border-neutral-100 p-3">
        {!collapsed && (
          <div className="mb-2 min-w-0 px-1">
            <div className="truncate text-sm font-medium text-neutral-800">{user.name || user.email}</div>
            {role && <div className="truncate text-xs capitalize text-neutral-400">{role}</div>}
          </div>
        )}
        <SignOutButton />
      </div>
    </aside>
  );
}
