# Bring Datadog query performance evidence across

This is a one-command import after export and source registration. It supports the native response from Datadog's [v1 Query Timeseries endpoint](https://docs.datadoghq.com/api/latest/metrics/query-timeseries-points/). Datadog recommends v2 for new integrations; v2 data is not accepted here. The importer reads a saved file without a vendor connection or credentials.

## Export the supported evidence

An authorised Datadog operator exports two metrics together for one fully completed, aligned time window:

```text
sum:postgresql.queries.count{YOUR_FILTER} by {host,db,user,query_signature}.rollup(sum,3600).as_count(),sum:postgresql.queries.time{YOUR_FILTER} by {host,db,user,query_signature}.rollup(sum,3600).as_count()
```

Use the actual estate filter in place of YOUR_FILTER. The endpoint requires timeseries_query permission. Its from and to request parameters are seconds since epoch. The returned from_date, to_date and point timestamps are milliseconds. Save the unchanged successful response as imports/query-window.json. Keep credentials in the existing authorised export process, never in this repository.

Choose boundaries aligned to the rollup, for example a finished pair of UTC hours. The accepted window is half-open: from_date inclusive, to_date exclusive. A point on the closing boundary is rejected, so export the precise window or have the mapping reviewed rather than silently dropping it. Query expressions and dimensions must match the form above. Do not average groups or convert units before saving. The importer derives bucket width from the explicit rollup, not the response interval metadata.

The [PostgreSQL integration](https://docs.datadoghq.com/integrations/postgres/) documents executions as counts and query time as nanoseconds. [Count-form exports](https://docs.datadoghq.com/metrics/custom_metrics/type_modifiers/) are essential: rates are not totals. Datadog's [query metrics view](https://docs.datadoghq.com/database_monitoring/query_metrics/) is limited to tracked normalized queries; exported evidence is not proof that every query was captured.

## Register, reconcile, import

Use a fresh database, then register the actual source:

```bash
npm run migrate
npm run performance -- add-source --name="Your Datadog organisation" --owner="Actual owner" --purpose="Weekly tuning review" --access-review=2026-12-01 --retention-review=2026-12-01 --actor="Actual operator"
npm run performance -- import datadog --source="Your Datadog organisation" --file=imports/query-window.json --expected-count=3 --source-ref="Actual export job, filters and window" --actor="Actual operator" --dry-run
```

Choose actual review dates. Replace 3 with the independently reconciled number of distinct host/database/user/signature identities, not the number of series or points. Both metrics must exist for every identity. After reconciling the dry run, repeat without --dry-run. Then read imports, coverage-review, windows and attention.

## Mapping and controls

| Datadog field | Owned record |
|---|---|
| Chosen organisation/source | Source namespace |
| host, db, user, query_signature tags | Query identity |
| from_date and to_date | Observation window |
| Count and time point pairs | Observed executions and nanoseconds |
| Null or absent pairs | Missing evidence count; mean withheld |
| Original response | Preserved import with digest, actor and export reference |

Values must be finite, nonnegative and within JavaScript's safe numeric magnitude. Execution counts are whole numbers. More than 100,000 buckets or 25 MB is rejected: split into non-overlapping windows. The whole import is atomic. Same observations skip; conflicting and overlapping windows refuse to overwrite the original. Use notes for a correction and retain the original evidence for review.

Query labels, tuning owners, due dates, actions and review notes are local work records. Alerts, dashboards, explain plans, raw query samples, application traces, other metric families, other database engines and v2 responses do not map. A custom mapping or collector requires separate implementation and tests. Do not cancel live monitoring on the strength of this import.

The examples are fictional native-shaped responses authored from the published field contract. They are not captured customer exports. Test the first real export with the dry run before relying on it.
