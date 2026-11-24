# Report and evidence contract

Use the resolved existing subscription folder as the output root, shown below as `<subscription-name>/`. Paths below are relative to that root, or to a fresh `runs/<UTC-timestamp>/` directory when preserving a previous run. Create only artifacts with actual content; mark unavailable evidence in the coverage register rather than filling folders with invented data.

```text
<subscription-name>/
  report.md
  manifest.json
  01-current-findings/
    overview.md
    resource-inventory.csv
    architecture.mmd
    network.mmd
    identity.mmd
  02-gap-analysis/
    gaps.md
    findings.json
    action-register.csv
  03-cost-drivers/
    cost-analysis.md
    costs-by-service.csv
    costs-by-resource.csv
    costs-by-resource-group.csv
    daily-costs.csv
    optimization-scenarios.csv
  04-architectural-critique/
    design-review.md
    alternatives-matrix.csv
  05-deep-dives/
    compute.md
    data-and-storage.md
    networking.md
    identity-and-security.md
    operations-and-recovery.md
    performance.md
    billing-and-utilization.md
  evidence/
    inventory/
    configuration/
    policy-and-access/
    costs/
    metrics/
    collection-log.json
    coverage.md
```

Adjust the deep dives to the resources actually observed. A Kubernetes or messaging deep dive is useful only if those services are present. Use resource/workload-specific subfolders when a single topic becomes large. Use filesystem-safe labels and preserve the original resource ID inside the document.

## Main report: required sections

### 1. Current Findings & Overview

Describe subscription identity, scope, reporting period, regions, resource groups, service/SKU distribution, environment boundaries and ownership. Explain observed application/data dependencies, ingress/egress paths, identity model, availability/recovery configuration and monitoring baseline. Distinguish provisioned resources from running or utilized resources and distinguish observed references from inferred traffic.

Show major architecture diagrams with their coverage limitations. Identify approved organizational requirements and exceptions separately from selected toolkit defaults. Include an executive overview of material risks, spending and decisions without hiding unknown areas.

### 2. Gap Analysis

Cover structural, security, operational and performance gaps. Where evidence permits, include availability dependencies, network exposure, least privilege, governance, logging, backup/restore testing, capacity and service limits. Missing evidence is a coverage gap; it is not proof that a control is absent.

Use stable finding IDs across the narrative, JSON and action register. Each finding should contain:

- Resource IDs/workload, category, observed state and expected requirement with its source.
- Status (`observed`, `hypothesis`, `unknown`, or `approved-exception`), severity, confidence and timestamped evidence references.
- Business/technical impact, recommendation, dependencies, effort, suggested owner role and verification criteria.
- Cost impact only where quantified from an explicit baseline and assumptions.

Prioritize using evidenced impact and implementation constraints. An approved exception should retain its scope and expiry where supplied.

### 3. Cost Drivers

Honor the user's requested period. Otherwise use the latest complete calendar month as the primary baseline, the preceding two complete months for comparison, and month-to-date as a separately labeled partial period, subject to available data. State exact boundaries, timezone, cost basis and currency. Do not compare a partial month directly with an entire prior month as a growth percentage.

Request full available billing detail or read-only cost queries for the selected period. Group by service, resource/resource group, region and meter/SKU where supported by the source. Capture daily trends and credits/adjustments, marketplace, support, shared and unattributed charges where they exist. Document the scope of exclusions. Do not sum the totals of alternative groupings: they describe the same spend.

Explain each major driver using quantity, billed duration, effective rate/tier and supporting resource configuration. Investigate idle or oversized compute, unattached disks, retained snapshots, database tiers, storage capacity/transactions/redundancy, logging retention/ingestion, network egress and duplicated environments only when those resources and relevant evidence exist. High spend alone is not an inefficiency.

Correlate utilization over a representative period with costs: CPU, memory when collected, storage/IOPS, throughput, concurrency and peak demand as appropriate. Include sampling interval, observed range, missing telemetry and workload schedule. Absence of telemetry does not mean zero use. A brief low-utilization window does not establish safe rightsizing.

Keep actual and amortized cost views separate. Use amortized evidence to evaluate allocation and commitment benefits where available; account for reservation/savings-plan coverage, utilization, term and payment timing before recommending a purchase. If only actual cost exists, explain that limitation. Never substitute public list prices for negotiated billed rates; label retail-price scenarios as estimates and retain the source/date.

Use the following calculations only with comparable scope, period, currency and cost basis:

```text
driver_share = driver_cost / same_basis_total
unallocated_remainder = same_basis_total - sum(non_overlapping_allocated_costs)
recurring_savings = baseline_recurring_cost - proposed_recurring_cost
simple_payback_months = one_time_transition_cost / positive_monthly_savings
```

Explain rounding, adjustments and non-resource charges in reconciliation rather than forcing mismatched totals to agree. Record each optimization's baseline, proposed configuration, quantity/rate assumptions, low/base/high estimate where useful, transition cost, confidence, prerequisites and service-level effects. Mark mutually exclusive or overlapping recommendations; do not add reservation savings to rightsizing savings on the original unreduced baseline. Do not claim savings or payback when required inputs are missing.

### 4. Architectural Critique

Separate verified design rationale from plausible hypotheses. Map strengths and weaknesses to known requirements before suggesting a replacement. A design can reasonably prioritize isolation, latency, managed operations or recovery over minimum cost.

Compare current design, a minimal-change improvement and feasible redesign options using the same demand and service objectives. Select concrete options from the observed workload rather than prescribing serverless, containers, consolidation or a database migration universally. The comparison should cover recurring and transition cost, SLO/RTO/RPO fit, performance, access/network implications, compliance/data residency, operating effort, lock-in and migration/rollback risk. Flag unknown inputs. Explain why the preferred option fits the available evidence and what would change that choice.

### 5. Deep-Dive Details

Link every detailed topic back to the main report and relevant finding IDs. Include configuration facts, bounded query results, metric windows, technical reasoning, alternatives and targeted follow-up questions. Evidence files should support reproduction without storing access tokens, connection secrets or unrelated sensitive data.

## Provenance and completion

`manifest.json` should record subscription name/UUID, tenant context, resolved output root, generation time, analysis periods, currency/cost bases, snapshot hash(es), tool/query or export sources, artifact paths and known exclusions. Record evidence file hashes where practical and never include credential material.

`collection-log.json` records each collection's scope, query/tool, time range, collection time, pagination/completeness and status. `coverage.md` distinguishes assessed, partially assessed and unavailable areas, including missing permissions or unsupported tool capabilities. Retain source timestamps for Azure Policy and cost data that may lag the current configuration.

Before handing off, check local links and artifact presence, complete evidence pagination, cost reconciliation, consistent snapshot references, separation of observed versus inferred claims, and the absence of secrets. State which questions remain unresolved and which additional evidence would resolve them. If blocked sources prevent a full assessment, deliver the supported sections and explicitly identify the remaining gaps.
