# Build Azure infrastructure with CloudSkills

## Start from Windows with VS Code Copilot

Double-click `Start-CloudBuild.cmd` in your local CloudSkills checkout and select the application folder. The launcher installs the complete skill under `.github/skills/cloud-build/` and starts a Copilot Agent chat with the infrastructure interview prompt. It requires Node.js and a recent VS Code with the `code` command available and Copilot set up. [VS Code chat command](https://code.visualstudio.com/docs/configure/command-line#_start-chat-from-the-command-line)

You can also run this from the CloudSkills checkout with a folder argument. Add `--install-only` to install without opening chat.

```powershell
node scripts/start-cloud-build.js 'C:\src\my-application'
```

Running the installer again is safe for an identical copy. If your project already contains a customized copy, review the reported folder before updating it. For manual use after installation, open the application in VS Code and run `/cloud-build` in Copilot Chat.

The launcher starts the design and code generation workflow. Azure access, imported policy, and native Terraform templates are available when you connect [CloudSkills MCP](CLIENTS.md) separately. Azure deployment can be requested after the generated infrastructure has been reviewed.

## Call the skill from your application workspace

1. Open the application repository in your AI client. Make the complete `cloud-build` folder available to that client. Keep its `references/` directory alongside `SKILL.md`.
2. Invoke the skill in chat with the command below. If your client does not expose the command, ask it to use `cloud-build` by name and check that the skill is discoverable.
3. Give the agent the application goal and the file format you want. It inspects the repository, asks one unresolved decision at a time, and records decisions and rationale in a Markdown design document. Give it that document to resume the interview.

| Client | Skill location in the application repository | Invocation |
| --- | --- | --- |
| GitHub Copilot in VS Code | `.github/skills/cloud-build/` | `/cloud-build`, or select the skill from the chat menu |
| Claude Code | `.claude/skills/cloud-build/` | `/cloud-build` |
| Codex | `.agents/skills/cloud-build/` | `$cloud-build` |

Use the current folder directly if the client already discovers it. For other clients or troubleshooting, see the [client setup guide](CLIENTS.md). [VS Code agent skills](https://code.visualstudio.com/docs/agent-customization/agent-skills) · [Claude Code skills](https://code.claude.com/docs/en/skills)

```text
Use the cloud-build skill. Read this application and any deployment files.
Grill me one infrastructure decision at a time. Recommend an option and explain
the trade-off. Record confirmed answers and open questions in infra/design.md.
Once the design is ready, generate Terraform in infra/ and validate it locally.
```

The interview can start from your files without Azure access. Connect the CloudSkills MCP server for Azure evidence, stored organization controls, and built-in Terraform templates. Configure the connection in the application workspace or at the client level. Point it to `src/server.js` in your CloudSkills checkout and use an absolute `POLICY_DATABASE` path to reuse the intended policy store. [MCP setup by client](CLIENTS.md)

## Read the current Azure Policy results

Authenticate in the same environment that runs the MCP server. For a local session using Azure CLI, run `az login` if needed and use the subscription UUID in `AZURE_SUBSCRIPTIONS`. An IDE-launched server needs that value in its own MCP configuration or inherited environment. The Azure identity must have permission to query Policy Insights at that scope. Set the allowlist explicitly even when the identity can see other subscriptions. [Azure credential chain](https://learn.microsoft.com/en-us/azure/developer/javascript/sdk/authentication/credential-chains)

```text
Use cloud-build and call azure_policy_audit for subscription <UUID>.
Report Azure's policy state counts, evaluation timestamps, affected resources,
and policy assignment IDs where available. Search our imported controls for
requirements relevant to the proposed design. Record coverage gaps in the doc.
```

`azure_policy_audit` queries the subscription's `Microsoft.PolicyInsights/policyStates/latest/queryResults` endpoint and follows Azure continuation links. It counts the returned evaluation records and returns pages of noncompliant and other non-`Compliant` states. These are the **latest evaluations available from Azure**, which can lag configuration changes. Follow the tool's `nextOffset` for additional evidence. Full assignment applicability, initiative parameters, exemptions and what a future deployment would do require additional evidence. [Azure Policy compliance data](https://learn.microsoft.com/en-us/azure/governance/policy/how-to/get-compliance-data)

Imported organization controls are a separate source. Use `search_organization_policy` to retrieve them and `compare_policy_baseline` to check a resource snapshot. `learn_organization_policy` saves approved controls when you request an import. A live policy read does not automatically populate that store. [Policy learning guide](POLICY-LEARNING.md)

## Understand tokens and saved data

| Item | How CloudSkills handles it |
| --- | --- |
| Azure access token | The server gets a short-lived ARM token from `DefaultAzureCredential` and uses it in Azure requests. CloudSkills does not write that token to the policy database or generated report. The Azure SDK may cache tokens in memory, and Azure CLI can retain its own sign-in cache when you use `az login`. |
| MCP HTTP bearer token | A separate credential supplied by the operator for CloudSkills HTTP mode. A local STDIO connection does not use it. For HTTP, store it in your approved client secret mechanism and inject `MCP_AUTH_TOKEN` into the server environment. |
| Organization controls | Explicit imports persist in the configured SQLite or PostgreSQL policy store. Reports and design documents are saved where the CLI or AI client writes them. |

Paginated findings and summaries can reduce the amount of Azure evidence sent to the model compared with pasting a full inventory. Actual AI token usage depends on the client, model and requested evidence. CloudSkills does not track or guarantee model token savings. [Azure SDK token caching](https://learn.microsoft.com/en-us/javascript/api/overview/azure/identity-readme?view=azure-node-latest#token-caching) · [CloudSkills security](SECURITY.md)

## Generate Terraform or PowerShell

| Format | How it is generated |
| --- | --- |
| Terraform JSON (`.tf.json`) | The `terraform_generate` MCP tool returns a starting file plus required inputs and prerequisites for supported Azure services. Ask your agent to save the returned content. |
| Terraform HCL (`.tf`) | Ask the agent to write or adapt HCL in the workspace. Use the repository's existing module and state conventions. Verify formatting and provider-backed validation when available. |
| Azure PowerShell (`.ps1`) | Ask the agent to write a parameterized script using `Az` modules and the target subscription. PowerShell generation uses the client's file editing, so there is no PowerShell generator MCP tool to enable. |

```text
Use cloud-build to design private Azure Storage. Check the available
organization controls, save the design, and generate infra/main.tf.json with the
required inputs. Run available local validation and summarize the results.
```

```text
Use cloud-build to write scripts/New-WorkloadResourceGroup.ps1 using
Az PowerShell. Require subscription ID, resource group name and approved region.
Check the Azure context, check for the existing group, support -WhatIf through
ShouldProcess, and save the script for review without running Azure writes.
```

Ask for a read-only verification script if you already deploy with Terraform. Avoid managing the same Azure resources through both Terraform and a separate mutating script. Azure PowerShell authentication runs in the script's `Az` session. A generated file is ready for review after the agent reports what it validated and any remaining prerequisites. Deployment is a separate action. [PowerShell `ShouldProcess` and `-WhatIf`](https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-shouldprocess)
