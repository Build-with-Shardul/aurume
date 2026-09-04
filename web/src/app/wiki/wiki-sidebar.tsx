"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createDocument, deleteDocument, archiveDocument } from "./actions";
import ConfirmDialog from "./confirm-dialog";
import type { WikiNode } from "@/lib/wiki";

export default function WikiSidebar({ nodes, userId }: { nodes: WikiNode[]; userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/wiki/") ? pathname.split("/")[2] : null;
  const [busy, setBusy] = useState(false);
  const [pendingDel, setPendingDel] = useState<{ id: string; title: string } | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, WikiNode[]>();
    for (const n of nodes) {
      const key = n.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return map;
  }, [nodes]);

  const workspace = nodes.filter((n) => n.visibility === "workspace" && !n.archived);
  const priv = nodes.filter((n) => n.visibility === "private" && n.authorId === userId && !n.archived);
  const archived = nodes.filter((n) => n.archived);

  const rootsOf = (bucket: WikiNode[]) => {
    const ids = new Set(bucket.map((b) => b.id));
    return bucket.filter((b) => !b.parentId || !ids.has(b.parentId));
  };

  async function create(parentId: string | null, visibility?: "workspace" | "private") {
    if (busy) return;
    setBusy(true);
    const r = await createDocument({ parentId, visibility });
    setBusy(false);
    if (r && "id" in r && r.id) { router.push(`/wiki/${r.id}`); router.refresh(); }
  }

  function del(id: string, title: string) {
    setPendingDel({ id, title });
  }

  async function confirmDel() {
    if (!pendingDel) return;
    setDelBusy(true);
    const wasActive = activeId === pendingDel.id;
    await deleteDocument(pendingDel.id);
    setDelBusy(false);
    setPendingDel(null);
    if (wasActive) router.push("/wiki");
    router.refresh();
  }

  async function restore(id: string) {
    await archiveDocument(id, false);
    router.refresh();
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-neutral-900">Wiki</span>
      </div>

      <div className="px-2">
        <button
          onClick={() => create(null, "workspace")}
          disabled={busy}
          className="mb-1 flex w-full items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 12v6M9 15h6" /></svg>
          New page
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        <Section
          title="All"
          count={workspace.length}
          menu={<Menu><Item onClick={() => create(null, "workspace")}>Add subfolder</Item></Menu>}
        >
          {workspace.length === 0 ? (
            <Empty>No pages yet</Empty>
          ) : (
            rootsOf(workspace).map((n) => <TreeNode key={n.id} node={n} childrenOf={childrenOf} bucketIds={new Set(workspace.map((w) => w.id))} activeId={activeId} depth={0} onNewChild={(id) => create(id)} onDelete={del} />)
          )}
        </Section>

        <Section title="Shared" count={0}>
          <Empty>No shared pages</Empty>
        </Section>

        <Section
          title="Private"
          count={priv.length}
          menu={<Menu><Item onClick={() => create(null, "private")}>Add subfolder</Item></Menu>}
        >
          {priv.length === 0 ? (
            <Empty>No private pages</Empty>
          ) : (
            rootsOf(priv).map((n) => <TreeNode key={n.id} node={n} childrenOf={childrenOf} bucketIds={new Set(priv.map((p) => p.id))} activeId={activeId} depth={0} onNewChild={(id) => create(id)} onDelete={del} />)
          )}
        </Section>

        <Section title="Archived" count={archived.length}>
          {archived.length === 0 ? (
            <Empty>No archived pages</Empty>
          ) : (
            archived.map((n) => <Row key={n.id} node={n} active={n.id === activeId} depth={0} onRestore={restore} onDelete={del} />)
          )}
        </Section>
      </nav>

      <ConfirmDialog
        open={!!pendingDel}
        title="Delete page?"
        message={`"${pendingDel?.title || "Untitled"}" and all of its subpages will be permanently deleted. This can't be undone.`}
        busy={delBusy}
        onConfirm={confirmDel}
        onCancel={() => setPendingDel(null)}
      />
    </aside>
  );
}

function Section({ title, count, menu, children }: { title: string; count: number; menu?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pt-2">
      <div className="group flex items-center">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-1 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-600">
          <span className="w-3">{open ? "▾" : "▸"}</span>
          {title}
          {count > 0 && <span className="ml-1 font-normal normal-case text-neutral-300">{count}</span>}
        </button>
        {menu && <div className="pr-1 opacity-0 group-hover:opacity-100">{menu}</div>}
      </div>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 py-1 text-xs text-neutral-400">{children}</p>;
}

// --- lightweight dropdown ---
function Menu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="More"
        className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg" onClick={() => setOpen(false)}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function Item({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className={`block w-full px-3 py-1.5 text-left text-sm ${danger ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-50"}`}
    >
      {children}
    </button>
  );
}

function Row({
  node,
  active,
  depth,
  onNewChild,
  onDelete,
  onRestore,
  hasKids = false,
  open = false,
  onToggle,
}: {
  node: WikiNode;
  active: boolean;
  depth: number;
  onNewChild?: (parentId: string) => void;
  onDelete?: (id: string, title: string) => void;
  onRestore?: (id: string) => void;
  hasKids?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const icon = node.icon || (hasKids ? (open ? "📂" : "📁") : "📄");
  return (
    <div className="group flex items-center" style={{ paddingLeft: depth * 12 }}>
      <button
        onClick={onToggle}
        aria-label={open ? "Collapse" : "Expand"}
        className={`flex h-6 w-4 shrink-0 items-center justify-center text-[9px] text-neutral-400 hover:text-neutral-700 ${hasKids ? "" : "invisible"}`}
      >
        {open ? "▾" : "▸"}
      </button>
      <Link
        href={`/wiki/${node.id}`}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{node.title || "Untitled"}</span>
      </Link>
      <div className="pr-1 opacity-0 group-hover:opacity-100">
        <Menu>
          {onNewChild && <Item onClick={() => onNewChild(node.id)}>Add subpage</Item>}
          {onRestore && <Item onClick={() => onRestore(node.id)}>Restore</Item>}
          {onDelete && <Item danger onClick={() => onDelete(node.id, node.title)}>Delete</Item>}
        </Menu>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  childrenOf,
  bucketIds,
  activeId,
  depth,
  onNewChild,
  onDelete,
}: {
  node: WikiNode;
  childrenOf: Map<string | null, WikiNode[]>;
  bucketIds: Set<string>;
  activeId: string | null;
  depth: number;
  onNewChild: (parentId: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const kids = (childrenOf.get(node.id) ?? []).filter((k) => bucketIds.has(k.id));
  const [open, setOpen] = useState(true);
  const hasKids = kids.length > 0;
  return (
    <div>
      <Row
        node={node}
        active={node.id === activeId}
        depth={depth}
        onNewChild={onNewChild}
        onDelete={onDelete}
        hasKids={hasKids}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {open && kids.map((k) => (
        <TreeNode key={k.id} node={k} childrenOf={childrenOf} bucketIds={bucketIds} activeId={activeId} depth={depth + 1} onNewChild={onNewChild} onDelete={onDelete} />
      ))}
    </div>
  );
}
