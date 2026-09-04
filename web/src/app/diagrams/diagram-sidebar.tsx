"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createDiagram, deleteDiagram, archiveDiagram, moveDiagram, setDiagramVisibility } from "./actions";
import ConfirmDialog from "../wiki/confirm-dialog";
import type { DiagramNode } from "@/lib/diagrams";

type PendingMove = { id: string; title: string; parentId: string | null; destVis: "workspace" | "private"; count: number };

type DndCtx = {
  draggedId: string | null;
  overKey: string | null;
  begin: (id: string) => void;
  end: () => void;
  over: (key: string | null) => void;
  canDrop: (targetId: string) => boolean;
  dropOnItem: (targetId: string, targetVisibility: string) => void;
  dropOnRoot: (visibility: "workspace" | "private") => void;
};
const Dnd = createContext<DndCtx | null>(null);
const useDnd = () => useContext(Dnd)!;

export default function DiagramSidebar({ nodes, userId }: { nodes: DiagramNode[]; userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/diagrams/") ? pathname.split("/")[2] : null;
  const [busy, setBusy] = useState(false);
  const [pendingDel, setPendingDel] = useState<{ id: string; title: string } | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, DiagramNode[]>();
    for (const n of nodes) {
      const key = n.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return map;
  }, [nodes]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const workspace = nodes.filter((n) => n.visibility === "workspace" && !n.archived);
  const priv = nodes.filter((n) => n.visibility === "private" && n.authorId === userId && !n.archived);
  const archived = nodes.filter((n) => n.archived);

  const rootsOf = (bucket: DiagramNode[]) => {
    const ids = new Set(bucket.map((b) => b.id));
    return bucket.filter((b) => !b.parentId || !ids.has(b.parentId));
  };

  function descendants(id: string) {
    const set = new Set<string>();
    const walk = (pid: string) => {
      for (const k of childrenOf.get(pid) ?? []) if (!set.has(k.id)) { set.add(k.id); walk(k.id); }
    };
    walk(id);
    return set;
  }

  async function create(parentId: string | null, visibility?: "workspace" | "private") {
    if (busy) return;
    setBusy(true);
    const r = await createDiagram({ parentId, visibility });
    setBusy(false);
    if (r && "id" in r && r.id) { router.push(`/diagrams/${r.id}`); router.refresh(); }
  }

  function del(id: string, title: string) { setPendingDel({ id, title }); }
  async function confirmDel() {
    if (!pendingDel) return;
    setDelBusy(true);
    const wasActive = activeId === pendingDel.id;
    await deleteDiagram(pendingDel.id);
    setDelBusy(false);
    setPendingDel(null);
    if (wasActive) router.push("/diagrams");
    router.refresh();
  }
  async function restore(id: string) { await archiveDiagram(id, false); router.refresh(); }
  async function archive(id: string) { await archiveDiagram(id, true); router.refresh(); }
  async function toggleVis(id: string, next: "workspace" | "private") { await setDiagramVisibility(id, next); router.refresh(); }

  // --- drag & drop ---
  const canDrop = (targetId: string) => !!draggedId && targetId !== draggedId && !descendants(draggedId).has(targetId);

  async function applyMove(id: string, parentId: string | null, destVis: "workspace" | "private") {
    setMoveBusy(true);
    await moveDiagram(id, parentId, destVis);
    setMoveBusy(false);
    router.refresh();
  }
  function requestMove(id: string, parentId: string | null, destVis: "workspace" | "private") {
    const node = byId.get(id);
    setDraggedId(null);
    setOverKey(null);
    if (!node) return;
    if (node.visibility !== destVis) {
      setPendingMove({ id, title: node.title, parentId, destVis, count: descendants(id).size });
    } else {
      applyMove(id, parentId, destVis);
    }
  }
  const dnd: DndCtx = {
    draggedId,
    overKey,
    begin: (id) => setDraggedId(id),
    end: () => { setDraggedId(null); setOverKey(null); },
    over: (key) => setOverKey(key),
    canDrop,
    dropOnItem: (targetId, targetVisibility) => {
      if (!draggedId || !canDrop(targetId)) { setDraggedId(null); setOverKey(null); return; }
      requestMove(draggedId, targetId, targetVisibility === "private" ? "private" : "workspace");
    },
    dropOnRoot: (visibility) => { if (draggedId) requestMove(draggedId, null, visibility); },
  };

  const moveMsg = pendingMove
    ? pendingMove.destVis === "private"
      ? `"${pendingMove.title || "Untitled diagram"}"${pendingMove.count ? ` and its ${pendingMove.count} nested diagram${pendingMove.count > 1 ? "s" : ""}` : ""} will become private — everyone in the workspace loses access; only you keep it.`
      : `"${pendingMove.title || "Untitled diagram"}"${pendingMove.count ? ` and its ${pendingMove.count} nested diagram${pendingMove.count > 1 ? "s" : ""}` : ""} will become visible to everyone in the workspace.`
    : "";

  return (
    <Dnd.Provider value={dnd}>
      <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-neutral-900">Diagrams</span>
        </div>

        <div className="px-2">
          <button
            onClick={() => create(null, "workspace")}
            disabled={busy}
            className="mb-1 flex w-full items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>
            New diagram
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          <Section title="All" count={workspace.length} dropVisibility="workspace" menu={<Menu><Item onClick={() => create(null, "workspace")}>Add sub-diagram</Item></Menu>}>
            {workspace.length === 0 ? <Empty>No diagrams yet</Empty> : rootsOf(workspace).map((n) => (
              <TreeNode key={n.id} node={n} childrenOf={childrenOf} bucketIds={new Set(workspace.map((w) => w.id))} activeId={activeId} depth={0} onNewChild={(id) => create(id)} onDelete={del} onArchive={archive} onToggleVis={toggleVis} />
            ))}
          </Section>

          <Section title="Shared" count={0}><Empty>No shared diagrams</Empty></Section>

          <Section title="Private" count={priv.length} dropVisibility="private" menu={<Menu><Item onClick={() => create(null, "private")}>Add sub-diagram</Item></Menu>}>
            {priv.length === 0 ? <Empty>No private diagrams</Empty> : rootsOf(priv).map((n) => (
              <TreeNode key={n.id} node={n} childrenOf={childrenOf} bucketIds={new Set(priv.map((p) => p.id))} activeId={activeId} depth={0} onNewChild={(id) => create(id)} onDelete={del} onArchive={archive} onToggleVis={toggleVis} />
            ))}
          </Section>

          <Section title="Archived" count={archived.length}>
            {archived.length === 0 ? <Empty>No archived diagrams</Empty> : archived.map((n) => (
              <Row key={n.id} node={n} active={n.id === activeId} depth={0} onRestore={restore} onDelete={del} draggable={false} />
            ))}
          </Section>
        </nav>

        <ConfirmDialog
          open={!!pendingDel}
          title="Delete diagram?"
          message={`"${pendingDel?.title || "Untitled diagram"}" and all of its nested diagrams will be permanently deleted. This can't be undone.`}
          busy={delBusy}
          onConfirm={confirmDel}
          onCancel={() => setPendingDel(null)}
        />
        <ConfirmDialog
          open={!!pendingMove}
          danger={pendingMove?.destVis === "private"}
          title={pendingMove?.destVis === "private" ? "Make private?" : "Make workspace-visible?"}
          message={moveMsg}
          confirmLabel="Move"
          busy={moveBusy}
          onConfirm={() => { if (pendingMove) applyMove(pendingMove.id, pendingMove.parentId, pendingMove.destVis); setPendingMove(null); }}
          onCancel={() => setPendingMove(null)}
        />
      </aside>
    </Dnd.Provider>
  );
}

function Section({ title, count, menu, dropVisibility, children }: { title: string; count: number; menu?: React.ReactNode; dropVisibility?: "workspace" | "private"; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const dnd = useDnd();
  const key = `root:${dropVisibility}`;
  const isOver = dnd.overKey === key && !!dnd.draggedId;
  const dropProps = dropVisibility
    ? {
        onDragOver: (e: React.DragEvent) => { if (dnd.draggedId) { e.preventDefault(); dnd.over(key); } },
        onDrop: (e: React.DragEvent) => { e.preventDefault(); dnd.dropOnRoot(dropVisibility); },
      }
    : {};
  return (
    <div className="pt-2">
      <div className={`group flex items-center rounded ${isOver ? "bg-blue-50 ring-1 ring-blue-300" : ""}`} {...dropProps}>
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

function Menu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }} aria-label="More" className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg" onClick={() => setOpen(false)}>{children}</div>
        </>
      )}
    </div>
  );
}

function Item({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }} className={`block w-full px-3 py-1.5 text-left text-sm ${danger ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-50"}`}>
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
  onArchive,
  onToggleVis,
  hasKids = false,
  open = false,
  onToggle,
  draggable = true,
}: {
  node: DiagramNode;
  active: boolean;
  depth: number;
  onNewChild?: (parentId: string) => void;
  onDelete?: (id: string, title: string) => void;
  onRestore?: (id: string) => void;
  onArchive?: (id: string) => void;
  onToggleVis?: (id: string, next: "workspace" | "private") => void;
  hasKids?: boolean;
  open?: boolean;
  onToggle?: () => void;
  draggable?: boolean;
}) {
  const dnd = useDnd();
  const icon = hasKids ? (open ? "📂" : "📁") : "📐";
  const isOver = draggable && dnd.overKey === `row:${node.id}` && dnd.canDrop(node.id);

  const dragProps = draggable
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => { e.stopPropagation(); dnd.begin(node.id); },
        onDragEnd: () => dnd.end(),
        onDragOver: (e: React.DragEvent) => { if (dnd.canDrop(node.id)) { e.preventDefault(); e.stopPropagation(); dnd.over(`row:${node.id}`); } },
        onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dnd.dropOnItem(node.id, node.visibility); },
      }
    : {};

  return (
    <div className={`group flex items-center rounded-lg ${isOver ? "bg-blue-50 ring-1 ring-blue-300" : ""}`} style={{ paddingLeft: depth * 12 }} {...dragProps}>
      <button onClick={onToggle} aria-label={open ? "Collapse" : "Expand"} className={`flex h-6 w-4 shrink-0 items-center justify-center text-[9px] text-neutral-400 hover:text-neutral-700 ${hasKids ? "" : "invisible"}`}>
        {open ? "▾" : "▸"}
      </button>
      <Link
        href={`/diagrams/${node.id}`}
        draggable={false}
        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${active ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"}`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{node.title || "Untitled diagram"}</span>
      </Link>
      <div className="pr-1 opacity-0 group-hover:opacity-100">
        <Menu>
          {onNewChild && <Item onClick={() => onNewChild(node.id)}>Add sub-diagram</Item>}
          {onToggleVis && <Item onClick={() => onToggleVis(node.id, node.visibility === "private" ? "workspace" : "private")}>{node.visibility === "private" ? "Make workspace-visible" : "Make private"}</Item>}
          {onArchive && <Item onClick={() => onArchive(node.id)}>Archive</Item>}
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
  onArchive,
  onToggleVis,
}: {
  node: DiagramNode;
  childrenOf: Map<string | null, DiagramNode[]>;
  bucketIds: Set<string>;
  activeId: string | null;
  depth: number;
  onNewChild: (parentId: string) => void;
  onDelete: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onToggleVis: (id: string, next: "workspace" | "private") => void;
}) {
  const kids = (childrenOf.get(node.id) ?? []).filter((k) => bucketIds.has(k.id));
  const [open, setOpen] = useState(true);
  const hasKids = kids.length > 0;
  return (
    <div>
      <Row node={node} active={node.id === activeId} depth={depth} onNewChild={onNewChild} onDelete={onDelete} onArchive={onArchive} onToggleVis={onToggleVis} hasKids={hasKids} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && kids.map((k) => (
        <TreeNode key={k.id} node={k} childrenOf={childrenOf} bucketIds={bucketIds} activeId={activeId} depth={depth + 1} onNewChild={onNewChild} onDelete={onDelete} onArchive={onArchive} onToggleVis={onToggleVis} />
      ))}
    </div>
  );
}
