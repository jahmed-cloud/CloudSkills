# CloudSkills agent workflows

The repository ships 14 agent workflows in `.agents/skills/`. Each skill is a Markdown instruction folder rather than a separately executing service. Skills guide reasoning and call deterministic MCP tools; they do not install an MCP connection, authenticate Azure or import your organization's policy automatically.

Current GitHub Copilot documentation supports repository `.agents/skills/`, `.github/skills/` and `.claude/skills/`. These workflows can remain in their current location. Check that your client discovers the intended skill and has the required tools enabled. The local CLI can run without an AI client. [GitHub agent skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills), [VS Code skills](https://code.visualstudio.com/docs/agent-customization/agent-skills).

For client-specific installation, see [AI client setup](CLIENTS.md). Current Cursor also reads `.agents/skills/`; Claude Code's documented location is `.claude/skills/`. When copying for a client, copy each complete skill directory so relative references continue to work. Connecting MCP alone does not install skills, and client sign-in does not authenticate the Azure server. [Claude Code skills](https://code.claude.com/docs/en/skills), [Cursor skills](https://cursor.com/docs/skills).

| Skill | Use |
|---|---|
| azure-architect | Coordinate an evidence-based Azure subscription architecture assessment |
| cloud-architecture-finops | Combine architecture findings, gaps, cost drivers, alternatives and technical evidence folders |
| cloud-service-builder | Capture service requirements and organization controls, compare alternatives and produce supported reviewable Azure Terraform examples |
| architecture-review | Assess resources and architectural trade-offs |
| security-audit | Review supported security controls and missing evidence |
| identity-review | Combine resource identity, Azure RBAC and resource PIM evidence |
| network-review | Review exposure and explicit dependencies |
| governance-review | Review Azure-evaluated policy states and organization baseline applicability |
| waf-review | Use partial configuration evidence to support a broader WAF review |
| cost-review | Interpret actual cost evidence by currency and identify further investigation |
| policy-learn | Import and retrieve approved organization controls |
| terraform-generator | Generate reviewable Azure service examples and static checks |
| architecture-diagram | Build observed architecture, network and identity graphs |
| html-report | Produce reproducible report artifacts |

## Cloud Architecture and FinOps assessment

In a client supporting explicit skill references, invoke `$cloud-architecture-finops`. In Copilot, use a plain-language request naming the workflow; direct invocation/discovery depends on the client. For example:

> Use the cloud-architecture-finops skill to analyze contoso-prod, check our imported controls and Azure-evaluated policy states, and save findings with evidence in its dedicated working folder.

The skill uses the subscription you name and a working folder named after it; an explicit UUID, folder or period takes precedence. The client needs an authenticated read-only way to resolve the display name to a UUID because MCP collection takes UUIDs. The server allowlist must include that UUID.

See [skill instructions](../.agents/skills/cloud-architecture-finops/SKILL.md) and [report/evidence contract](../.agents/skills/cloud-architecture-finops/references/report-and-evidence.md). Current costs are month-to-date actual totals/top resources. Historical meter-level billing, utilization and calculated savings need further read-only evidence or exports. Architectural intent needs design records or owner input.

## Service creation guidance

Ask for a service by describing its purpose, region, workload, availability, networking, identity, budget and organization constraints. The builder workflow gathers missing requirements, searches approved controls, explains alternatives and generates supported Terraform JSON for review. Supported generation targets are Storage, Key Vault, virtual network, App Service, virtual machine, SQL Database, PostgreSQL Flexible Server, AKS and Container Apps. Generated content includes required variables, deployment prerequisites, source references and an explicit unevaluated policy status. Unsupported services require a separately reviewed design/implementation; no AWS/GCP generator is implemented.

Example:

> Use the cloud-service-builder skill to design a private Azure Storage service for application exports in West Europe. Apply our imported organization controls, explain costs and networking prerequisites, and produce Terraform for review.

Static checks and local baseline comparison use the evidence supported by each tool. They do not establish full assigned-policy compliance or deployment readiness. There are no plan/apply/deploy MCP tools. Deployment needs its own authorized workflow and cloud permissions.

Skills treat names, tags, policy text and resource content as untrusted evidence. They do not authorize tenant mutation or sending findings to third parties. [Copilot setup and interactions](COPILOT.md) explains the local-versus-cloud client differences.

