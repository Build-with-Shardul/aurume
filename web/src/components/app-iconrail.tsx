"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Rail = { key: string; label: string; href: string; match: string[]; icon: React.ReactNode };

const I = (paths: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);

const RAILS: Rail[] = [
  { key: "projects", label: "Projects", href: "/projects", match: ["/projects"], icon: I(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>) },
  { key: "wiki", label: "Wiki", href: "/wiki", match: ["/wiki", "/knowledge"], icon: I(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>) },
  { key: "resources", label: "Resources", href: "/resources", match: ["/resources"], icon: I(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
  { key: "ai", label: "AI", href: "/usage", match: ["/usage"], icon: I(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />) },
  { key: "settings", label: "Settings", href: "/settings/profile", match: ["/settings", "/admin"], icon: I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>) },
];

export default function AppIconRail({ instanceAdmin }: { instanceAdmin: boolean }) {
  const pathname = usePathname();
  const active = (r: Rail) => r.match.some((m) => pathname === m || pathname.startsWith(m + "/"));

  return (
    <aside className="flex h-full w-[68px] shrink-0 flex-col items-center border-r border-neutral-200 bg-white py-2.5">
      <nav className="flex flex-1 flex-col items-center gap-0.5">
        {RAILS.map((r) => {
          const on = active(r);
          return (
            <Link
              key={r.key}
              href={r.href}
              title={r.label}
              className={`flex w-14 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors ${
                on ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              <span className={on ? "text-neutral-900" : "text-neutral-600"}>{r.icon}</span>
              {r.label}
            </Link>
          );
        })}
      </nav>
      {instanceAdmin && (
        <Link href="/superadmin" title="Platform admin" className={`flex w-14 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium ${pathname.startsWith("/superadmin") ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-50"}`}>
          {I(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>)}
          Admin
        </Link>
      )}
    </aside>
  );
}
