# Use CloudSkills with AI clients

CloudSkills provides two independently configured capabilities: **skills** describe repeatable workflows; **MCP tools** collect evidence, evaluate supported controls and generate artifacts. Connect the MCP server and enable the relevant skill in your client. Installing one does not automatically configure the other.

The same 14 workflow folders and 22 MCP tools can be reused across compatible clients. Compatibility below follows the linked official documentation checked on **2026-11-24**; a live session with each client and your tenant is still required to verify the complete setup. Azure is the implemented cloud provider; AWS/GCP are planned.

For an infrastructure design interview, use the following prompt in the application workspace:

> Use cloud-build. Read this application and its deployment files. Grill me one decision at a time, explain what you recommend and why, and keep the design document updated. Once the design has enough confirmed inputs, build the Terraform and validate it.

The agent starts or updates a Markdown design document in the application workspace. Give it that document to resume in another session. For invocation commands, Azure Policy access, credential storage, and Terraform or PowerShell prompts, see the [Cloud Service Builder usage guide](SERVICE-BUILDER.md).

## Choose your client

| Client | Skills in this repository | Local MCP configuration | Notes |
|---|---|---|---|
| GitHub Copilot in VS Code | `.agents/skills/` is supported | `.vscode/mcp.json`, with top-level `servers` | Use an agent session and enable the server/tools. See [Copilot guide](COPILOT.md). |
| GitHub Copilot in Visual Studio | `.agents/skills/` is supported in versions with Agent Skills | Add through the tool picker, or `.vs/mcp.json` with `servers` | MCP: VS 2022 17.14+ / VS 2026. Native skills: VS 2026 18.5+. |
| Claude Code | Copy desired complete folders to `.claude/skills/` | `claude mcp add` or project `.mcp.json` with `mcpServers` | Invoke `/cloud-build` or name the skill in chat. |
| Cursor | `.agents/skills/` is supported | `.cursor/mcp.json` with `mcpServers` | Enable the server in Customize/MCP and select the skill through `/` or name it. |
| Another MCP/Agent Skills client | Follow that client's documented discovery path | Its STDIO or Streamable HTTP configuration | MCP support alone does not establish automatic skill discovery. |

Sources: [VS Code skills](https://code.visualstudio.com/docs/agent-customization/agent-skills), [VS Code MCP formats](https://code.visualstudio.com/docs/agents/reference/mcp-configuration), [Visual Studio skills](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-skills), [Visual Studio MCP](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers), [Claude Code skills](https://code.claude.com/docs/en/skills), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Cursor skills](https://cursor.com/docs/skills), [Cursor MCP](https://cursor.com/docs/mcp).

## Prepare the local server once

Use Node.js 24 and your client's supported agent/tool-calling version. Sign in to the AI client separately from Azure. Clone the repository:

```sh
git clone https://github.com/jahmed-cloud/CloudSkills.git
cd CloudSkills
npm ci
```

If using the existing `AzureSkills` checkout, open that folder instead; its physical name does not affect the server. Use the **actual absolute checkout path** in configurations below, for example `C:/Users/jahmed/Desktop/Junaid/AzureSkills`. Replace `C:/path/to/CloudSkills` and `YOUR_SUBSCRIPTION_UUID` in each example before use. A folder containing spaces must be quoted in shell commands.

For live collection, authenticate in the environment that runs the MCP process, for example with `az login`. Set `AZURE_SUBSCRIPTIONS` to the explicitly permitted UUIDs. Azure authentication through a configured service principal or managed identity is also supported. An empty allowlist disables live Azure reads. Offline fixture reviews need no Azure authentication.

Keep `POLICY_DATABASE` absolute so all sessions use the intended organization store rather than creating one relative to a different working directory. Client approval settings and your organization's MCP policies can also affect tool availability.

## VS Code with GitHub Copilot

Open this checkout as the VS Code workspace. Create `.vscode/mcp.json` using [the existing configuration example](../examples/copilot-mcp.json), replace its subscription placeholder, then start CloudSkills through the MCP controls. The example uses `${workspaceFolder}`, which resolves to the open checkout. Keep skills in `.agents/skills/`; no copy is required. Use Copilot's agent experience, enable CloudSkills tools, and verify skill discovery. [Detailed setup and prompts](COPILOT.md).

The `.vscode/mcp.json` format uses `servers`. Copilot's portable `.mcp.json` format uses `mcpServers`; available configuration destinations vary by harness/version. Follow the active client's schema rather than renaming one file and assuming it is equivalent. [VS Code configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

## Visual Studio with GitHub Copilot

Visual Studio is a different IDE from VS Code. For MCP, use Visual Studio 2022 17.14 or later, or Visual Studio 2026. For automatic skill discovery, use **Visual Studio 2026 18.5 or later**. Open the repository/solution, select Copilot Chat **Agent**, then **Tools → + → Add custom MCP server**. Enter `node` with the absolute `src/server.js` argument and the server environment shown below. Enable the added tools. [Visual Studio MCP setup](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers).

For a configuration file, the documented solution-local `.vs/mcp.json` location can contain this `servers` entry. Use absolute paths so the process does not depend on IDE working-directory or variable expansion behavior:

```json
{
  "servers": {
    "cloudskills": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/CloudSkills/src/server.js"],
      "env": {
        "AZURE_SUBSCRIPTIONS": "YOUR_SUBSCRIPTION_UUID",
        "POLICY_DATABASE": "C:/path/to/CloudSkills/knowledge/organization/policies.db"
      }
    }
  }
}
```

Supported Visual Studio versions discover `.agents/skills/` directly. Review skill activation in chat/tool controls; an older MCP-capable version may need the workflow instructions supplied manually or an upgrade for native skills. [Visual Studio skill requirements and locations](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-skills).

## Claude Code

Claude Code documents project skills under `.claude/skills/`. Keep `.agents/skills/` as this repository's authoritative source and copy the **whole skill folder**, including `references/`, `assets/`, `scripts/` or other supporting files when present. A single `SKILL.md` copy can break relative references. This PowerShell example copies all workflows without overwriting an existing skill:

```powershell
New-Item -ItemType Directory -Path '.claude/skills' -Force | Out-Null
Get-ChildItem -LiteralPath '.agents/skills' -Directory | ForEach-Object {
    $destination = Join-Path '.claude/skills' $_.Name
    if (Test-Path -LiteralPath $destination) {
        throw "Skill already exists: $destination; review it before updating."
    }
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse
}
```

Run it only for a destination you intend to populate. You can instead copy individual desired folders to `.claude/skills/<name>/` or `~/.claude/skills/<name>/`. Refresh local copies when the source changes; avoid editing two versions independently. Start Claude Code in that project and use `/cloud-build` or name another workflow. [Claude Code skill locations and invocation](https://code.claude.com/docs/en/skills).

Register STDIO from the intended project directory. The following is one command; the `--env` pairs precede `--transport` to avoid the server name being parsed as an environment value:

```sh
claude mcp add --scope project --env AZURE_SUBSCRIPTIONS=YOUR_SUBSCRIPTION_UUID POLICY_DATABASE=C:/path/to/CloudSkills/knowledge/organization/policies.db --transport stdio cloudskills -- node C:/path/to/CloudSkills/src/server.js
```

Quote each `KEY=value` pair and the script path if they contain spaces. Project scope writes `.mcp.json`; review it before sharing, particularly machine-specific paths or credentials. Check `claude mcp list` or `/mcp` and approve the project server when requested. [Claude Code MCP commands and scopes](https://code.claude.com/docs/en/mcp).

## Cursor

Open the checkout in Cursor. Current Cursor supports `.agents/skills/` directly, so keep the source folders where they are. Select a workflow through `/` in Agent chat, or name it in the request. [Cursor skill discovery](https://cursor.com/docs/skills).

Create `.cursor/mcp.json` with `mcpServers`, replace the paths and UUID, then enable CloudSkills in Customize/MCP:

```json
{
  "mcpServers": {
    "cloudskills": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/CloudSkills/src/server.js"],
      "env": {
        "AZURE_SUBSCRIPTIONS": "YOUR_SUBSCRIPTION_UUID",
        "POLICY_DATABASE": "C:/path/to/CloudSkills/knowledge/organization/policies.db"
      }
    }
  }
}
```

Use the server/tools list to verify connection before a live review. Cursor supports STDIO and Streamable HTTP; its remote/cloud configuration is separate from local settings. [Cursor MCP configuration](https://cursor.com/docs/mcp).

## First successful interaction

Start with fixture evidence and a fresh output folder:

> Use the architecture-review skill. Read examples/subscription.json, call CloudSkills with that complete snapshot, explain the observed failures and missing evidence, and save an HTML report in reports/client-demo-01. Label it synthetic evidence.

Inspect the tool activity: `azure_architecture_review` should receive `snapshot`, not a filename or a fabricated subscription. `generate_html_report` returns content; the client's file tools save it. A skill being visible does not prove a tool call ran successfully.

Then use an explicit live UUID:

> Use cloud-architecture-finops to assess subscription <UUID>. Retrieve Azure-evaluated policy states and compare our imported approved controls. Explain cost evidence and gaps, and save the assessment with technical evidence in <working-folder>.

For service design:

> Use cloud-build to design a private Azure API backed by PostgreSQL. Gather missing requirements, check our approved controls, compare suitable designs, and generate Terraform and an implementation checklist for review.

For policy ingestion:

> Use policy-learn to import the approved controls in <file>. Report unsupported entries, then compare subscription <UUID> against the learned baseline and cite each control's source.

Organization policy is not automatically imported at startup. Local control ingestion and Azure-evaluated policy states are separate tools; complex native definition semantics remain outside the supported importer. See [policy learning](POLICY-LEARNING.md).

## Other clients, HTTP and hosted agents

For another MCP client, configure a local STDIO process with command `node`, argument `<absolute-project-root>/src/server.js`, the subscription allowlist and an absolute policy database path. Then follow that client's documented skill installation location. If it lacks Agent Skills support, provide the selected workflow as ordinary instructions and make its referenced files available; automatic skill selection and slash commands will not be available through MCP alone.

If HTTP is required, run `npm run start:http`, configure `MCP_AUTH_TOKEN` with at least 32 random characters and exact allowed hosts, then connect to `/mcp` with `Authorization: Bearer <token>`. Check whether the client supports custom headers. CloudSkills supplies static bearer authentication, not an OAuth authorization server. Configure remote TLS/authentication according to [security boundaries](SECURITY.md); keep secrets out of committed client files. [Server setup](MCP.md).

Hosted/cloud agents have their own filesystem, identity and network. A skill in source control does not transfer your local `az login`, SQLite database, Windows paths or localhost endpoint. Supply the runtime, approved credentials, allowlist and persistent policy store in the execution environment, or a reachable secured HTTP service. Local MCP connections may still send returned evidence to the selected AI provider; use your organization's approved data handling.

## Troubleshooting

| Symptom | Check |
|---|---|
| Skill is absent | Correct skill location, full folder copied where necessary, supported client version, and skill discovery/activation settings. |
| Server exits or tools are absent | Node 24, `npm ci`, actual absolute script path, MCP logs and required trust/tool approvals. |
| Azure read is refused | Correct UUID in `AZURE_SUBSCRIPTIONS`, credentials in the server's environment, and endpoint-specific read permissions. |
| Controls are missing between sessions | Shared absolute `POLICY_DATABASE`; imported controls are not in Git or transferred automatically. |
| Client configuration is ignored | Use the correct `servers` versus `mcpServers` schema and the client's own configuration location. |
| Report saving fails | Client file permissions and a fresh output path; MCP returns content rather than writing arbitrary paths. |

No template generation, skill invocation or MCP setup grants deployment permission. Generated Terraform still needs its required inputs, policy review and provider-backed validation; these MCP tools do not run plan/apply.
