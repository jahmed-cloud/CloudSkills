# Validation record

CloudSkills uses deterministic fixtures and mocked Azure HTTP responses for local validation. Run the checks from the project root with Node.js 24:

Validated during this refactor: **59 tests passed, one optional PostgreSQL integration test skipped**, source/skill-frontmatter checks passed, and `tsc --noEmit` passed. All **14 skills** also passed the bundled skill validator. Both base and PostgreSQL Compose configurations validated. All nine generated Terraform JSON examples parsed through local Terraform validation; missing provider packages prevented provider-schema validation. Docker Desktop's daemon was unavailable, so no Docker image build/runtime result is claimed.

Fresh synthetic review artifacts are under `reports/cloudskills-preview-20261023/`; nine independent service examples and their implementation prerequisites are under `reports/service-examples-20261023/`. These folders are ignored by Git and are examples, not live tenant findings or deployments.

The physical directory rename was attempted after validation and rejected by Windows because the workspace directory was in use. The current path remains AzureSkills; [migration steps](MIGRATION.md) document how to finish once the workspace is closed. Package and server branding are CloudSkills.

```sh
npm ci
npm run check
npm run typecheck
npm test
npm run demo
```

The check command covers source syntax and skill frontmatter. The separate typecheck command covers the TypeScript provider-contract boundary with `tsc --noEmit`. TypeScript runs natively under Node 24 for erasable syntax; a successful type check does not prove cloud permissions or service compatibility.

The test suite covers selected configuration rules, unknown evidence, NSG exposure, normalized policy imports/atomic persistence, concurrent SQLite ingestion, Terraform JSON analysis, omission of secret values, explicit-reference diagrams, HTML escaping, currency separation, guarded Azure requests, pagination, caching and CLI artifacts/error codes. Refactor-specific tests exercise a non-Azure fixture provider through generic reporting/policy/diagram paths, provider registration and cache/collection bounds.

MCP integration tests launch a real STDIO server with the official SDK client, discover the retained tools and call review/policy/report capabilities. HTTP integration uses an ephemeral loopback listener and Streamable HTTP client, including rejected authentication, Origin and Host requests. These tests establish local protocol behavior rather than end-to-end compatibility with every agent client.

The supplied synthetic subscription has six resources. Example/demo reports are synthetic evidence and do not represent a tenant assessment. Repeat a demo into a fresh directory because prior artifact files are preserved.

## What remains environment-dependent

- Live Azure endpoint access, permissions, real subscription sizes and tenant behavior need a run with the intended read identity.
- Docker image execution and the optional PostgreSQL service require their corresponding local services. Unit tests alone do not validate them.
- Optional PostgreSQL integration runs when `TEST_POSTGRES_URL` points to a disposable test database and adds uniquely named controls.
- CI configuration includes checks, PostgreSQL integration and Docker build work; a workflow file is not evidence that CI has run.
- Copilot setup follows current official documentation. Live Copilot skill/tool discovery with your organization configuration and Azure context needs a client session.
- Terraform examples are static JSON examples. Local analysis is not provider-backed `terraform validate`, a plan, full Azure Policy evaluation or deployment verification.
- HTML structure/escaping and report contents are tested. A rendered browser visual review has not been completed.
- AWS and GCP adapters are placeholders and have no live validation or supported runtime behavior.

Record the exact command outputs when validating a deployment. Do not equate a passing fixture test suite or a generated report with full security, architecture or FinOps coverage.

