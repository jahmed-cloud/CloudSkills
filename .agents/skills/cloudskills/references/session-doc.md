# Session document contract

The interview keeps its decisions in the working folder, so the conversation can stop and resume, and cloud-build can continue in the same place. Use `services/<workload>/<run>/`, where `<run>` is a UTC date or timestamp. Preserve existing runs; start a new run folder rather than overwriting one.

```text
services/<workload>/<run>/
  requirements.md
  decisions.md
  policy-review.md
```

cloud-build later adds `design.md`, `infrastructure/`, `validation.md`, `deployment-checklist.md` and `operations.md` to the same folder.

## requirements.md

The current state of the service. Rewrite it in place after every answer.

```markdown
# <Workload> requirements

Request: <the user's request, in their words>
Status: interviewing | ready for build | paused
Subscription: <name> (<UUID or "not yet chosen">)
Started: <UTC timestamp>  Updated: <UTC timestamp>

## Evidence read
- Organization controls: <count> matched (<control IDs>), searched <UTC timestamp>
- Azure Policy: <assignment names and effects that constrain this service>, read <UTC timestamp>
- Template: terraform_generate <kind>; required inputs: <list>
- Reusable resources: <resource IDs>
- Not available: <evidence that could not be read, and why>

## Decisions
| ID | Topic | Decision | Status | Source |
|---|---|---|---|---|
| D-01 | Region | West Europe | from-evidence | Allowed-locations assignment |
| D-02 | Hosting | App Service, Linux, Node 22 | confirmed | User |

## Open questions
- <question>: <why it is still open, and who can answer it>

## Out of scope
- <items the user explicitly excluded>
```

## decisions.md

An append-only log, one entry per decision. When a decision changes, add a new entry and mark the old one `superseded by D-xx`; do not edit history.

```markdown
## D-04 Network exposure: private ingress through Application Gateway with WAF
Date: <UTC>  Status: confirmed | assumed | from-evidence | superseded by D-xx
Context: Partner users need access from the internet; policy denies public network access on App Service.
Options: (a) Front Door Premium with Private Link, (b) Application Gateway WAF v2 in the hub, (c) policy exception for public access.
Decision: (b), reusing the existing hub gateway.
Consequences: Requires a listener and backend pool change on the shared gateway; owned by the network team.
Evidence: <assignment name>, <resource ID of the gateway>
```

Status values:

- `confirmed`: the user decided.
- `assumed`: the user accepted the recommendation or skipped the question. Record the recommendation that was used.
- `from-evidence`: policy, organization controls or the existing estate decided it.
- `open`: still undecided. Also listed under Open questions in requirements.md.

## policy-review.md

One row per constraint that applies to the service.

```markdown
| Constraint | Source | Effect | Affects | Status |
|---|---|---|---|---|
| Allowed locations: westeurope, northeurope | Azure Policy assignment <name> | Deny | D-01 | satisfied by design |
| App Service public network access disabled | Azure Policy assignment <name> | Deny | D-04 | satisfied by design |
| Owner tag required | Organization control <ID> | Audit | Tags | open: owner not named |
```

Status values: `satisfied by design`, `conflict`, `exception needed`, `unknown`. A conflict is never resolved by assuming an exception: record the options and who can grant one.

Do not store secrets, tokens, connection strings, or more resource detail than the decisions need.
