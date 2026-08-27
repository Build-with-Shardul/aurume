# Known issues & current limitations

Aurume is pre-release and built in the open. This page is an honest list of what
is known to be rough, approximate, or not yet built — kept alongside the code so
the gaps are visible, not hidden. For the broader "not yet built" inventory (the
AI eval harness, workflow orchestration, ingestion, ops), see
[`docs/GAPS.md`](docs/GAPS.md). To report something not listed here, open an
[issue](https://github.com/Build-with-Shardul/aurume/issues/new/choose).

Last reviewed: 2026-08-27 (v0.2.0).

## Scheduling & the Gantt

- **The scheduler is a greedy list scheduler, not full CPM / resource-leveling.**
  It honours dependencies, per-assignee capacity, weekends, and leave, and schedules
  ready work first — but it does not optimally backfill idle gaps or level an
  over-allocated resource. A person waiting on a dependency may sit idle even if other
  ready work exists.
- **Critical path is a single binding chain, not full float analysis.** It is computed
  by walking back from the last-finishing story through whichever predecessor (a
  dependency or the same assignee's prior task) ended latest. It highlights *one*
  critical chain; it does not compute per-task slack/float or surface multiple
  near-critical paths.
- **Dependencies are not validated for logical cycles in the UI.** The engine breaks
  cycles defensively (it will still schedule), but nothing yet stops you from creating
  an A→B→A dependency; the result is simply scheduled in an arbitrary but stable order.
- **Arrows are drawn only between scheduled stories.** A dependency on an unpointed or
  unassigned story (which isn't placed on the chart) is skipped silently. On dense
  charts, arrows can cross or overlap bars.
- **Cross-project resource allocation is surfaced, not resolved.** Each project is
  scheduled independently. The Resources view shows a person's combined allocation and
  where months overlap, but it does not automatically resolve an over-allocation across
  projects.
- **The scheduling engine (`lib/schedule.ts`) has been verified manually, not yet with
  an automated test suite.**

## AI generation

- **Groundedness is a heuristic, not a semantic faithfulness eval.** It counts inline
  `[Kn]` citations and the citations array against the available knowledge; it does not
  verify that each claim is actually supported by its cited source. A real eval harness
  (`delivery-evals`) is on the roadmap.
- **Cost is an estimate.** It is derived from reported token counts × a static
  per-model price table, and can drift from a provider's actual billing.
- **A configured provider key is required.** With no Anthropic/OpenAI/Ollama connector
  (or env key), generation fails with a clear message rather than degrading — there is
  no built-in model.
- **Generation quality depends on the knowledge base.** Sparse or off-topic project
  knowledge produces lower-grounded, more generic output.

## Export

- **PDF/Word export covers the tabular sections with bordered, colored-header tables**,
  but very long cell text can overflow the page width in the PDF renderer.

## General

- **Pre-release: schema and APIs can change between versions.** Migrations between
  pre-releases are not guaranteed; treat data as disposable until 1.0.
- **Default blob storage is single-node filesystem.** It is pluggable (S3/R2), but the
  default is not suitable for multi-node deployments as-is.
