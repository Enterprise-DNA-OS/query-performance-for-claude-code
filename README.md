# Query Performance for Claude Code

Own your query performance review, tuning decisions and evidence. A focused alternative for the review work performed with saved Datadog Database Monitoring metrics.

Built by Enterprise DNA. MIT licence. Works with Claude Code, Codex, OpenCode or Cursor.

| Do it yourself | We customise it | We run it for you |
|---|---|---|
| Free. Install the database and commands below. | Your estate, rules, imports and reports. | Installed, connected and operated through Omni by Enterprise DNA. Setup fee, then a retainer. |
| [Quick start](#quick-start) | [Get your version built](https://enterprisedna.co/omni/book/?offer=replace-software&utm_medium=github&utm_campaign=datadog-database-monitoring) | [Book a call](https://enterprisedna.co/omni/book/?offer=replace-software&utm_medium=github&utm_campaign=datadog-database-monitoring) |

## Quick start

Node 20 or newer. The demo needs no Datadog account or external database.

```bash
git clone https://github.com/Enterprise-DNA-OS/query-performance-for-claude-code.git
cd query-performance-for-claude-code
npm install
npm run demo
npm run performance -- slow-queries
npm run view
npm run docs
```

Use a fresh local folder for the fictional demo. PGlite persists to .data/db. Do not seed a business database. Set DATABASE_URL and run npm run migrate for your own PostgreSQL database. Use a separate DATA_DIR for real local records. Demo seeding resets the fictional query labels and owners, so use the normal CLI for your work.

The fictional data has three query identities and six windows. Order lookup rises from a weighted 250 ms to 750 ms. Catalogue search falls from 1,000 ms to 500 ms. Billing has one missing paired bucket, so its mean is withheld. An overdue tuning task and overdue source reviews make the attention view useful immediately.

## The working week

1. `/slow-queries` ranks the latest saved query windows.
2. `/regression-review` compares equal-length windows without averaging averages.
3. `/workload-review` compares observed execution time within each host and window.
4. `/coverage-review` shows missing samples and unassigned ownership.
5. `/weekly-review` combines performance, changes and attention into a private draft.

The CLI has 25 verbs including help. There are 28 slash-command recipes. Run `npm run performance -- help`. Human-readable columns are the default; add --json for processing. Unique names match without case and UUID prefixes work. Ambiguous names list candidates and exit 1.

## Bring saved Datadog data across

Export a native Datadog v1 Query Timeseries response using the exact count and time expressions in [the switching guide](docs/replace-datadog-database-monitoring.md). Register the source, reconcile the distinct query count, then import in one command:

```bash
npm run performance -- import datadog --source="Your source" --file=imports/query-window.json --expected-count=3 --source-ref="Actual export window and filters" --actor="Actual operator" --dry-run
```

Replace the count and placeholders with your actual evidence. Remove --dry-run after reconciliation. This importer supports PostgreSQL query execution count and nanosecond time metrics, grouped by host, database, user and query signature. It does not claim compatibility with arbitrary exports, other database engines, query samples or explain plans. Datadog recommends its newer v2 endpoint; this base deliberately supports the still-documented v1 response only.

Imports validate every series before writing, preserve the native response, reject conflicting or overlapping windows and leave existing evidence intact. Repeating the same import skips existing observations. Source namespaces keep equal query signatures from separate organisations apart. The importer makes no network call and handles no credential.

## Ten questions to ask

These are implemented questions, not claims that Datadog cannot answer the same questions.

1. Which saved query is slowest in its latest window? `slow-queries`
2. Which query became slower between equal-length windows? `regression-review`
3. Which query improved after the previous review? `regression-review`
4. Which host accounts for the most observed execution time? `workload-review`
5. Which results are too incomplete to quote a mean latency? `coverage-review`
6. Which queries have no tuning owner? `compliance`
7. Which tuning tasks are overdue? `attention`
8. What did we observe for one query across both windows? `query --ref="Order lookup"`
9. Which source access and retention reviews are overdue? `compliance`
10. Who imported evidence and recorded follow-up? `history`

## Your first hour: ten things to ask for

1. Set our name, logo and colours in brand.json.
2. Register our source, purpose and accountable owner.
3. Agree access and retention review dates.
4. Export a complete aligned window from the existing monitor.
5. Reconcile the distinct query count before importing.
6. Give each query a business label and owner.
7. Review missing samples before quoting performance.
8. Assign a tuning investigation with an actual due date.
9. Record evidence and close the task after review.
10. Render the weekly view and tuning briefs.

`/customise` adds fields and rules through a tested migration. `/new-view` adds a read-only report. Nothing runs a query against a production system.

## Records and reports

Eight domain record types hold sources, hosts, query identities, imports, observations, actions, notes and events. Imported observations, source responses, notes and events are append-only. New evidence never rewrites the past. A typed actor records attribution; it is not authentication. The application connects as a trusted operator. RLS blocks public access but is not a complete multi-user access model.

`npm run docs` renders a tuning evidence brief per query and a source access/retention review per source. `npm run view` renders views/week.html. brand.json controls the business name, logo and colours. Reports escape record content and stay private.

`/compliance` checks access and retention review dates, query ownership, stale evidence and missing samples. [Rules and sources](docs/compliance.md) distinguish legal principles from local review policy. No automatic deletion or certification is provided.

`npm run performance -- export --file=exports/backup-YYYY-MM-DD.json` writes all eight record types to a new file and refuses overwrites. Keep original exports and native database backups. JSON restore is not implemented.

## Scope and validation

This is a saved-evidence review system. Continuous collection, live alerts, query text analysis, explain plans, application traces and automatic optimisation need separate implementation. Keep existing monitoring until its operational requirements are covered. [Why no front end](docs/why-no-front-end.md).

npm test exercises every CLI verb, migration and seed idempotency, weighted arithmetic, missing samples, namespace separation, conflict rollback, evidence immutability, ambiguous names, closure evidence, backups and escaped HTML. [Validation](docs/validation.md). [Selection and research](docs/research.md).

MIT. Built and optionally operated through [Omni by Enterprise DNA](https://enterprisedna.co/omni/instead-of/datadog-database-monitoring?utm_source=github&utm_medium=readme&utm_campaign=datadog-database-monitoring).
