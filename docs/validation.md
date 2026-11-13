# Validation

Checked 13 November 2026.

- Linux local: npm install, npm test, npm run demo, npm run view and npm run docs passed.
- npm test exercises all 25 CLI verbs. Checks include repeated migration and seed, weighted latency, missing pairs, source separation, dry runs, duplicate imports, conflicting evidence rollback, expression and unit validation, immutable observations, ambiguous names and exit codes, closure evidence, complete export and escaped HTML.
- [Remote validation run](https://github.com/Enterprise-DNA-OS/query-performance-for-claude-code/actions/runs/43354294727) passed all five jobs at implementation commit 576985f00678c9dfcbf437f73635c72e7504aad6: Windows and Linux on Node 20 and 22, plus PostgreSQL 17.
- 28 slash-command recipes ship. The directory README is excluded from the count.
- The fictional demo renders a weekly view and four internal documents. The weekly view and order-lookup tuning brief were opened in a headless browser, screenshotted and visually inspected.
- Three actual CLI runs are saved in docs/demo-captures.json and used on the comparison page.
- The shared landing-page route was rendered in an isolated local preview. Desktop and mobile screenshots were inspected. The output has noindex,nofollow, six attributed booking links and no horizontal overflow at 390 pixels. The gate also passed against that rendered HTML. The public URL still returned 404 after push, so host deployment is not claimed.
- The canonical page gate passed with seven sourced price mentions and no brand errors. The repository was verified PRIVATE on GitHub, main was pushed, and Landing Pages commit 0b43a914 pushed the target with live=false. Registry status is drafted.

The import fixture is fictional and follows the published Datadog v1 response contract. No customer export or live Datadog account was used. Real imports must first pass the dry run and count reconciliation. Saved-window review does not supply continuous collection, live alerting, explain plans or production tuning. The base also does not provide an authenticated multi-user service, automatic retention deletion or JSON restore.

Tests use a temporary PGlite directory and ignore the operator's DATABASE_URL. TEST_DATABASE_URL is accepted only for an explicitly disposable empty database.
