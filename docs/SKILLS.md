# CloudSkills agent workflows

The repository ships 15 agent workflows in `.agents/skills/`. Each skill is a Markdown instruction folder rather than a separately executing service. Skills guide reasoning and call deterministic MCP tools; they do not install an MCP connection, authenticate Azure or import your organization's policy automatically.

Current GitHub Copilot documentation supports repository `.agents/skills/`, `.github/skills/` and `.claude/skills/`. These workflows can remain in their current location. Check that your client discovers the intended skill and has the required tools enabled. The local CLI can run without an AI client. [GitHub agent skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills), [VS Code skills](https://code.visualstudio.com/docs/agent-customization/agent-skills).

For client-specific installation, see [AI client setup](CLIENTS.md). Current Cursor also reads `.agents/skills/`; Claude Code's documented location is `.claude/skills/`. When copying for a client, copy each complete skill directory so relative references continue to work. Connecting MCP alone does not install skills, and client sign-in does not authenticate the Azure server. [Claude Code skills](https://code.claude.com/docs/en/skills), [Cursor skills](https://cursor.com/docs/skills).

| Skill | Use |
|---|---|
| cloudskills | Chat entry point: read policy, controls and templates, then interview you one decision at a time and record each decision before building |
| azure-architect | Coordinate an evidence-based Azure subscription architecture assessment |
| cloud-architecture-finops | Combine architecture findings, gaps, cost drivers, alternatives and technical evidence folders |
| cloud-build | Capture service requirements and organization controls, compare alternatives and produce supported reviewable Azure Terraform examples |
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

## Chat with CloudSkills

Start with what you want to build. In Claude Code or Cursor, type the skill name followed by your request. In GitHub Copilot, name the skill in a plain-language request:

```text
/cloudskills help me create a web app
```

> Use the cloudskills skill to help me create a web app.

A session runs in four stages:

1. **Evidence first.** It asks for the target subscription and working folder. It then reads your imported organization controls (`search_organization_policy`) and Azure-evaluated policy states (`azure_policy_audit`). With your OK, it reads the policy assignments and exemptions that would apply to a new deployment through read-only Azure CLI. It generates the matching template with `terraform_generate` to learn which inputs are required, and looks for existing networks, DNS zones, Key Vaults and workspaces to reuse.
2. **Grilling.** It asks one question at a time in dependency order: environment, region, hosting model, network exposure, identity, data and secrets, availability, scale, operations, cost and delivery. Each question comes with why it matters, what the evidence says and a recommendation. Questions the evidence already answers are stated, not asked. Vague answers are pushed to numbers, and conflicts with policy are named with options rather than worked around.
3. **Living document.** Every answer updates `requirements.md`, `decisions.md` and `policy-review.md` under `services/<workload>/<run>/` in your working folder, so you can stop and resume.
4. **Hand-off.** When every question is decided, assumed or explicitly open, it summarizes the design. If you agree, it continues with cloud-build to generate Terraform, validation notes and a deployment checklist in the same folder. Nothing is deployed.

`cloud-build` has its own design interview, which starts from your application's source and deployment files ([usage guide](SERVICE-BUILDER.md)). Use `/cloudskills` when you want Azure Policy and the templates read before the first question.

Answer "use your recommendation" to any question, or "skip to defaults" to record the remaining recommendations as assumptions. The [question bank](../.agents/skills/cloudskills/references/question-bank.md) and the [session document contract](../.agents/skills/cloudskills/references/session-doc.md) list what it asks and what it records.

Live subscription reads need the subscription UUID in the server's `AZURE_SUBSCRIPTIONS` allowlist. Without it, the session still works from organization controls, templates and your answers, and keeps subscription-specific questions open.

An illustrative exchange, using synthetic names rather than tenant output:

> **You:** /cloudskills help me create a web app for partner order tracking
>
> **CloudSkills:** Three constraints apply in `contoso-prod`: only West Europe and North Europe are allowed (deny), App Service public network access is denied, and an `owner` tag is required (audit). The App Service template needs an integration subnet, a private-endpoint subnet and private DNS zones. `vnet-hub-weu` already has a delegated subnet and the `privatelink.azurewebsites.net` zone. I've started `services/partner-orders/20261124/requirements.md`.
>
> First question: partners reach this app from the internet, but policy keeps it private. Should their traffic come through the existing Application Gateway with WAF in the hub, or through a new Front Door Premium with Private Link? I recommend the existing gateway: no new edge cost, and the network team already operates it. Front Door adds a global edge at a higher cost.

## Cloud Architecture and FinOps assessment

In a client supporting explicit skill references, invoke `$cloud-architecture-finops`. In Copilot, use a plain-language request naming the workflow; direct invocation/discovery depends on the client. For example:

> Use the cloud-architecture-finops skill to analyze contoso-prod, check our imported controls and Azure-evaluated policy states, and save findings with evidence in its dedicated working folder.

The skill uses the subscription you name and a working folder named after it; an explicit UUID, folder or period takes precedence. The client needs an authenticated read-only way to resolve the display name to a UUID because MCP collection takes UUIDs. The server allowlist must include that UUID.

See [skill instructions](../.agents/skills/cloud-architecture-finops/SKILL.md) and [report/evidence contract](../.agents/skills/cloud-architecture-finops/references/report-and-evidence.md). Current costs are month-to-date actual totals/top resources. Historical meter-level billing, utilization and calculated savings need further read-only evidence or exports. Architectural intent needs design records or owner input.

## Service creation guidance

Start with the [Cloud Service Builder usage guide](SERVICE-BUILDER.md) for client invocation commands, policy access, and prompts for Terraform and PowerShell.

Ask for a service by describing its purpose, region, workload, availability, networking, identity, budget and organization constraints. The builder workflow gathers missing requirements, searches approved controls, explains alternatives and generates supported Terraform JSON for review. Supported generation targets are Storage, Key Vault, virtual network, App Service, virtual machine, SQL Database, PostgreSQL Flexible Server, AKS and Container Apps. Generated content includes required variables, deployment prerequisites, source references and an explicit unevaluated policy status. Unsupported services require a separately reviewed design/implementation; no AWS/GCP generator is implemented.

Example:

> Use the cloud-build skill to design a private Azure Storage service for application exports in West Europe. Apply our imported organization controls, explain costs and networking prerequisites, and produce Terraform for review.

Static checks and local baseline comparison use the evidence supported by each tool. They do not establish full assigned-policy compliance or deployment readiness. There are no plan/apply/deploy MCP tools. Deployment needs its own authorized workflow and cloud permissions.

Skills treat names, tags, policy text and resource content as untrusted evidence. They do not authorize tenant mutation or sending findings to third parties. [Copilot setup and interactions](COPILOT.md) explains the local-versus-cloud client differences.

