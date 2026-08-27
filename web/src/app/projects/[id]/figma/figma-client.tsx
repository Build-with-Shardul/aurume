"use client";

import { useState } from "react";
import Link from "next/link";
import { generateFigmaCode } from "./actions";
import type { FigmaCodeResult } from "@/lib/ai/figma-code";

type Target = { id: string; label: string; language: string; styling: string };
type ModelInfo = { provider: string; options: string[]; defaultModel: string };

export default function FigmaClientView({
  projectId,
  canWork,
  figmaConnected,
  targets,
  modelInfo,
}: {
  projectId: string;
  canWork: boolean;
  figmaConnected: boolean;
  targets: Target[];
  modelInfo: ModelInfo;
}) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState(targets[0]?.id ?? "react-tailwind");
  const [model, setModel] = useState(modelInfo.defaultModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FigmaCodeResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await generateFigmaCode(projectId, url, target, model);
      if ("error" in res) setError(res.error);
      else setResult(res.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const money = (micros: number | null) => (micros == null ? "—" : `$${(micros / 1e6).toFixed(4)}`);

  return (
    <div className="space-y-5">
      {!figmaConnected && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No Figma token yet. Add one in{" "}
          <Link href="/settings/connectors" className="font-medium underline">Settings → Connectors → Figma</Link>{" "}
          (a Figma personal access token). Generation needs it.
        </p>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <label className="block text-sm font-medium">Figma frame link</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.figma.com/design/…?node-id=10-2"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-neutral-400">In Figma: right-click the frame/component → Copy link to selection.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">Target</label>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm">
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.label} — {t.language}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Model</label>
            {modelInfo.options.length ? (
              <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm">
                {modelInfo.options.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
              </select>
            ) : (
              <input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" placeholder="model name" />
            )}
          </div>
        </div>

        <button
          onClick={run}
          disabled={busy || !canWork || !url.trim()}
          className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate code"}
        </button>
        {!canWork && <span className="ml-3 text-xs text-neutral-400">You don&apos;t have permission to generate here.</span>}
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500">
            <span className="font-medium text-neutral-900">{result.sourceName}</span>
            <span>→ {targets.find((t) => t.id === result.target)?.label ?? result.target}</span>
            <span>·</span>
            <span>{result.model}</span>
            <span>·</span>
            <span>{(result.promptTokens + result.completionTokens).toLocaleString()} tokens</span>
            <span>·</span>
            <span>{money(result.costUsdMicros)}</span>
          </div>

          {result.warnings.length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              {result.warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}
          {result.notes && <p className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-600">{result.notes}</p>}

          {result.files.map((f, i) => (
            <FileBlock key={i} path={f.path} language={f.language} content={f.content} />
          ))}

          {result.tokensUsed.length > 0 && (
            <p className="text-xs text-neutral-400">Figma tokens referenced: {result.tokensUsed.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function FileBlock({ path, language, content }: { path: string; language: string; content: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }
  function download() {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = path.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-2">
        <span className="font-mono text-xs text-neutral-700">{path}</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">{language}</span>
          <button onClick={copy} className="text-neutral-500 hover:text-neutral-900">{copied ? "Copied" : "Copy"}</button>
          <button onClick={download} className="text-neutral-500 hover:text-neutral-900">Download</button>
        </div>
      </div>
      <pre className="overflow-auto p-4 text-xs leading-relaxed text-neutral-800"><code>{content}</code></pre>
    </div>
  );
}
