"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateProjectChannels } from "../../actions";

export default function ProjectChannelsForm({
  projectId,
  slackChannel,
  teamsChannel,
  slackConnected,
  teamsConnected,
  canManage,
  canManageOrg,
}: {
  projectId: string;
  slackChannel: string | null;
  teamsChannel: string | null;
  slackConnected: boolean;
  teamsConnected: boolean;
  canManage: boolean;
  canManageOrg: boolean;
}) {
  const router = useRouter();
  const [slack, setSlack] = useState(slackChannel ?? "");
  const [teams, setTeams] = useState(teamsChannel ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk(false);
    setBusy(true);
    const r = await updateProjectChannels(projectId, {
      slackChannel: slack.trim() || null,
      teamsChannel: teams.trim() || null,
    });
    setBusy(false);
    if (r?.error) return setErr(r.error);
    setOk(true);
    router.refresh();
  }

  const field = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-400";
  const label = "mb-1 block text-sm font-medium text-neutral-700";

  function Status({ connected }: { connected: boolean }) {
    return connected ? (
      <span className="text-xs text-green-600">Workspace connected</span>
    ) : (
      <span className="text-xs text-amber-600">
        Not connected at the workspace level.{" "}
        {canManageOrg ? (
          <Link href="/settings/connectors" className="underline">Connect it</Link>
        ) : (
          "Ask a platform admin to connect it."
        )}
      </span>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-medium">Connected channels</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Point this project at a Slack and/or Teams channel. Later, Aurume will pull updates from these channels.
        The workspace-level Slack and Teams connection is set up once by a platform admin under Connectors.
      </p>
      {err && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {ok && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Saved.</p>}

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <label className={label}>Slack channel</label>
            <Status connected={slackConnected} />
          </div>
          <input
            disabled={!canManage}
            value={slack}
            onChange={(e) => setSlack(e.target.value)}
            placeholder="#project-alpha or C0123ABCD"
            className={field}
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className={label}>Teams channel</label>
            <Status connected={teamsConnected} />
          </div>
          <input
            disabled={!canManage}
            value={teams}
            onChange={(e) => setTeams(e.target.value)}
            placeholder="Channel name or 19:xxxxx@thread.tacv2"
            className={field}
          />
        </div>
      </div>

      {canManage && (
        <button disabled={busy} className="mt-5 rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save channels"}
        </button>
      )}
    </form>
  );
}
