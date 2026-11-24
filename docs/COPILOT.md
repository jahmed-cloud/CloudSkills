# GitHub Copilot setup and user interaction

CloudSkills can be used with GitHub Copilot by connecting the MCP server and making its skills available. The simplest setup runs Copilot in VS Code and the MCP server on the same computer as your Azure login. Hosting this project on GitHub is not required for that local setup.

This guide covers VS Code. For the distinct Visual Studio desktop IDE, Claude Code, Cursor and other clients, use [AI client setup](CLIENTS.md). Visual Studio supports MCP from 2022 version 17.14, while native Agent Skills require Visual Studio 2026 version 18.5 or later. [Visual Studio MCP](https://learn.microsoft.com/en-us/visualstudio/ide/mcp-servers), [Visual Studio skills](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-agent-skills).

Current GitHub and VS Code documentation supports repository skills under `.agents/skills/` as well as `.github/skills/` and `.claude/skills/`. Keep this project's skills in `.agents/skills/`; no duplicated folders are needed. Skills are discovered when relevant, but discovery does not guarantee use for every prompt. Name the desired skill in your request and inspect the tool activity. [GitHub skills setup](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills), [VS Code skill discovery](https://code.visualstudio.com/docs/agent-customization/agent-skills).

## Local VS Code setup

1. Install Node.js 24, install/sign into GitHub Copilot and open the CloudSkills root folder in VS Code.
2. Run `npm ci` in that folder. For live collection, run `az login` with the intended Azure read identity and obtain the subscription UUID.
3. Create `.vscode/mcp.json` with the configuration below, replacing the UUID.
4. Start CloudSkills using the MCP controls or **MCP: List Servers**. Review/trust the server when the client requests it, enable the tools and open a Copilot agent session.
5. Check skill discovery in the customization/skills UI and ask Copilot to use a named workflow. Verify that evidence came from tool calls rather than an unaided model response.

```json
{
  "servers": {
    "cloudskills": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/src/server.js"],
      "cwd": "${workspaceFolder}",
      "env": {
        "AZURE_SUBSCRIPTIONS": "00000000-0000-0000-0000-000000000001",
        "POLICY_DATABASE": "${workspaceFolder}/knowledge/organization/policies.db"
      }
    }
  }
}
```

The same configuration is provided in `examples/copilot-mcp.json`; replace its subscription placeholder before using it.

VS Code's `.vscode/mcp.json` uses `servers`, `type`, `command`, `args`, `cwd` and `env`. Portable `.mcp.json` and Copilot user `mcp-config.json` use `mcpServers`; do not blindly copy one format into the other. If using WSL, a container or remote development, install Node/dependencies and authenticate Azure in the environment that launches the server. [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

Azure CLI authentication is optional if a configured service principal or managed identity is available to `DefaultAzureCredential`. The explicit UUID allowlist is required regardless. An offline snapshot review needs no Azure credentials. After a physical project-folder rename, reopen the renamed folder and update absolute client configuration paths.

## Example conversations

Start with an offline review to verify connectivity:

> Use the architecture-review skill and the CloudSkills MCP tools to review examples/subscription.json. Explain the failures and missing evidence, then save the generated HTML report under a fresh reports/copilot-demo folder.

For your subscription:

> Use the cloud-architecture-finops skill to analyze contoso-prod. Resolve its subscription UUID using my authenticated Azure context, collect evidence with CloudSkills, and save the report plus detailed supporting files in the dedicated working folder. Distinguish observed facts, missing evidence and design assumptions.

MCP collection accepts UUIDs. If the client has no allowed way to resolve a display name, supply the UUID directly. File reading and saving use the client's file tools; CloudSkills MCP returns contents and does not choose arbitrary server-side output paths.

For Azure-evaluated policy compliance:

> Call azure_policy_audit for subscription <UUID>. Summarize Azure's evaluated compliance states, show noncompliant resources and report stale or unavailable evidence.

For approved organization controls:

> Use policy-learn to import the approved controls in <policy-file>. Show imported, unchanged and unsupported entries. Search the stored controls and compare subscription <UUID> with that baseline, citing the policy source for each result.

For requirements-led service design:

> Use cloud-build to design an Azure App Service for our internal API. Gather the workload, availability, network, identity, budget and regional requirements, check our imported organization controls, compare suitable architectures, and produce supported Terraform JSON for review.

The agent orchestrates tools and explains results. The server performs deterministic reads/checks and local policy persistence. No tool deploys services, assigns policies or remediates findings.

## Does it understand our organization's Azure policy?

It can retrieve stored approved controls and read Azure's evaluated policy states, subject to identity permissions. It starts with no imported knowledge of your organization's standards. `azure_policy_audit` does not automatically populate the policy database.

Import accepts explicit normalized controls or a narrow native Azure Policy subset: exactly a literal type condition plus a literal tag/location condition under `allOf`, with `audit`/`deny`. Full assignment scopes, management-group inheritance, initiatives, parameters, aliases and exemptions are not resolved into a complete baseline. Unsupported expressions must remain unsupported. Use Azure-evaluated results and policy-owner context for the remaining semantics. [Implementation and examples](POLICY-LEARNING.md).

## Copilot on GitHub and cloud agents

A GitHub-hosted agent has a different filesystem, network and identity from your laptop. Your local `C:/...` paths, Azure CLI token cache, policy SQLite file and `127.0.0.1:3000` are not automatically available there. Either install/start this server with its Node.js 24 prerequisites in that environment, or provide a reachable secured HTTP deployment plus credentials and approved network access.

GitHub repository MCP configuration is configured separately in the repository's Copilot MCP settings. It uses `mcpServers`, a transport type and a tool allowlist. The current GitHub documentation states that cloud agent/code review use MCP tools rather than resources or prompts, and code review excludes tools without `readOnlyHint: true`. Consequently code review cannot call this server's `learn_organization_policy` local-write tool. Azure identity, allowlists and store persistence must be configured for the execution environment; local VS Code configuration does not accomplish this automatically. [GitHub repository MCP configuration](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers).

Use your organization's Copilot settings and approved handling for resource/policy evidence. Client compatibility is based on current documented formats; end-to-end Copilot use with your tenant has not been validated by the local unit tests.
