# Record controls and sources

Checked 13 November 2026. These checks support a human review; they do not certify compliance, enforce retention or authorise production tuning.

| Rule | Implemented check | Basis |
|---|---|---|
| access-review | Source access review date is past | Local evidence prompt supporting NZ Privacy Act 2020 IPP 5 |
| retention-review | Source retention review date is past | Local evidence prompt supporting NZ Privacy Act 2020 IPP 9 |
| query-owner | No accountable query owner | Local tuning policy |
| incomplete-evidence | Latest window contains missing count/time pairs | Local reporting-integrity policy |
| stale-evidence | Latest window ended over seven days ago | Local weekly review policy, not a statutory deadline |

[IPP 5](https://www.privacy.org.nz/privacy-principles/5/) requires reasonable safeguards for personal information. [IPP 9](https://www.privacy.org.nz/privacy-principles/9/) limits retention to what is necessary for a lawful purpose. User tags and imported response text can contain personal information even when the metrics appear technical. Dates recorded here do not prove the controls exist. The operator must record actual review evidence, restrict access, assess backups and dispose of records through the business's approved retention process.

The importer requires a reviewed export. Datadog describes [parameter obfuscation](https://docs.datadoghq.com/database_monitoring/guide/parameterized_queries/) but this application cannot verify that an export is free of personal or secret data. Review it before import. Do not commit real data. Typed actor names are not authenticated identities.

[Metric semantics](https://docs.datadoghq.com/integrations/postgres/) define count and execution-time metrics. [Count modifiers](https://docs.datadoghq.com/metrics/custom_metrics/type_modifiers/) explain why rates must not be summed as counts. We accept only explicit count-form exports. Incomplete pairs suppress mean latency, equal-length windows are required for a percentage change, and overlapping evidence is rejected.

Shared production use needs authenticated access, least-privilege database roles, tested backups and an approved retention process. Australian and other deployments must agree their applicable rules before operational use.
