"use client";

function initials(nameOrEmail: string) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export default function AppTopbar({ workspaceName, user }: { workspaceName: string; user: { name: string; email: string } }) {
  const ws = workspaceName || "Workspace";
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-3">
      {/* Workspace switcher */}
      <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-100" title="Switch workspace">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-neutral-900 text-[11px] font-bold text-white">{ws[0]?.toUpperCase()}</span>
        <span className="max-w-[160px] truncate text-sm font-semibold">{ws}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {/* Search (visual placeholder for now) */}
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-400">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        <span className="truncate">Search {ws}</span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-0.5">
        <button className="relative rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800" title="Notifications" aria-label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
        </button>
        <button className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800" title="Help" aria-label="Help">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
        </button>
        <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-semibold text-neutral-700" title={user.name || user.email}>
          {initials(user.name || user.email)}
        </div>
      </div>
    </header>
  );
}
