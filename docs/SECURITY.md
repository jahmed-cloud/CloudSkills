# Security boundaries

Azure access is read-only by construction. The Azure adapter implements fixed GET/read-query endpoints, validates subscription allowlists before authentication and rejects off-origin/unexpected-path pagination. No ARM create/update/delete calls, Terraform subprocesses, remediation commands or arbitrary target URL tools exist. Provider-neutral interfaces do not grant extra cloud access. AWS/GCP placeholders contain no authentication or collection implementation.

Use an Azure identity with only the read permissions the intended scope requires. Application guards supplement RBAC; they do not reduce a credential's permissions outside this process. Resource Graph generally requires read access to resources. Authorization, resource PIM, Policy Insights and Cost Management have their own read actions; a Reader role does not guarantee access to every specialized endpoint. Report 403 results as evidence gaps rather than automatically requesting Contributor or Owner. Microsoft Graph permissions are not requested.

STDIO inherits the launching user's trust boundary. HTTP requires a bearer token of at least 32 characters, exact Host validation and browser Origin checks. The token grants all exposed tool access, including imports into shared organization knowledge. Use TLS, secret management and separate instances for separate trust boundaries beyond loopback. The server has no OAuth/user federation, token expiry, per-principal audit trail, rate limiter or tenant isolation. Docker publishes host loopback by default.

Resource names, tags, policy descriptions and imported text are untrusted evidence, not agent instructions. Core HTML escapes evidence and applies a restrictive Content Security Policy without external assets/scripts. Mermaid labels are sanitized. Report and graph formatting do not execute resource content. Terraform input values are not echoed wholesale; state and plan documents may contain secrets, so share only necessary evidence with an AI client.

Reports and policy stores may contain organization information. They are excluded from Git, but the application does not encrypt SQLite. Use filesystem permissions, encrypted disks and approved backup handling. Configure TLS on remote PostgreSQL without disabling certificate verification. The optional Compose database is a local development configuration. The server does not upload its database to an LLM; clients can receive selected returned evidence.

The inventory cache retains structured clones with bounded serialized bytes and absolute TTL. These are cache limits, not a process-wide memory cap. Oversized snapshots are not retained. Tool collection and response limits remain separate guards.

The CLI writes only under its selected output directory and refuses to overwrite existing artifacts. MCP tools return content and cannot choose arbitrary server-side paths. Generating reviewable infrastructure examples does not authorize deployment. Client tools used for saving, planning or deploying have independent permissions.

A local Azure CLI login is not automatically available inside Docker, WSL, remote VS Code or a GitHub cloud-agent environment. Configure the identity in the environment that runs the MCP process. GitHub Copilot code review excludes tools marked `readOnlyHint: false`, including organization policy ingestion. See [Copilot setup](COPILOT.md).

Install pinned transitive dependencies using `npm ci`; run the documented checks after deliberate updates. The runtime needs no TypeScript compiler or application build at startup. No telemetry or model-provider SDK is configured by CloudSkills.
