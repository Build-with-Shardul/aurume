"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/app/sign-out-button";

type NavItem = { href: string; label: string; icon: string };

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
    try { setCollapsed(localStorage.getItem("aurume.sidebar") === "1"); } catch { /* ignore */ }
  }, []);
  const toggle = () =>
    setCollapsed((c) => { const n = !c; try { localStorage.setItem("aurume.sidebar", n ? "1" : "0"); } catch { /* ignore */ } return n; });

  const main: NavItem[] = [
    { href: "/projects", label: "Projects", icon: "📁" },
    { href: "/knowledge", label: "Org knowledge", icon: "📚" },
    { href: "/resources", label: "Resources", icon: "🧑‍💻" },
    ...(canManage ? [{ href: "/admin/people", label: "Manage people", icon: "👥" }] : []),
    { href: "/usage", label: "AI usage", icon: "📈" },
  ];
  const settings: NavItem[] = [
    { href: "/settings/profile", label: "Profile", icon: "👤" },
    { href: "/settings/role", label: "My role", icon: "🛡️" },
    { href: "/settings/connectors", label: "Connectors", icon: "🔌" },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Item = ({ it }: { it: NavItem }) => (
    <Link
      href={it.href}
      title={it.label}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive(it.href) ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"} ${collapsed ? "justify-center" : ""}`}
    >
      <span className="shrink-0 text-base leading-none">{it.icon}</span>
      {!collapsed && <span className="truncate">{it.label}</span>}
    </Link>
  );

  return (
    <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-150 ${collapsed ? "w-16" : "w-60"}`}>
      <div className="flex items-center justify-between px-3 py-4">
        {!collapsed && <Link href="/" className="px-1 text-lg font-semibold tracking-tight">Aurume</Link>}
        <button onClick={toggle} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title={collapsed ? "Expand" : "Collapse"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {main.map((it) => <Item key={it.href} it={it} />)}

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
              {settings.map((it) => <Item key={it.href} it={it} />)}
            </div>
          )}
        </div>

        {instanceAdmin && <div className="pt-2"><Item it={{ href: "/superadmin", label: "Platform admin", icon: "🛠️" }} /></div>}
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
