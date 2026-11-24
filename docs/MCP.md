# MCP configuration and contracts

Use `node src/server.js` for STDIO, or append `--transport http` for Streamable HTTP. `mcp/server/index.js` remains a compatible entry point. The server identifies itself as CloudSkills; all 22 original tool names are preserved. Azure is the only configured provider.

## Client configuration

Use an absolute entry path and explicit subscription allowlist. Generic clients with an `mcpServers` format can use the example in [README](../README.md); VS Code uses a different `servers` format. See [Copilot setup](COPILOT.md) for exact configuration, Azure authentication and conversation examples. Installing a skill alone does not configure MCP or authenticate Azure.

HTTP uses stateless JSON responses at `/mcp`; GET and DELETE return 405. Requests need a static bearer token, validate Host/browser Origin and cap JSON bodies at 10 MiB. Configure `MCP_ALLOWED_HOSTS` as exact host:port values. Browser CORS is not enabled. Use TLS and deployment authentication controls beyond local loopback.

Each HTTP request gets a server/transport instance sharing a policy store, provider registry and Azure reader/cache. The shared token authorizes all exposed tools and the configured identity/allowlist. Separate trust boundaries need separate instances, identities and stores. OAuth discovery, per-user delegation and multi-tenant authorization are not implemented.

## Evidence inputs

Generic report, diagram and baseline-comparison tools accept `provider` and exactly one of:

- `snapshot`: complete normalized evidence;
- `scope: {"accountIds": ["account-id"]}`: server-side provider collection;
- `subscriptions`: the existing Azure compatibility form.

Azure review tools retain their existing `snapshot` or `subscriptions` contract. Azure defaults remain compatible with snapshots lacking a provider field; explicit incompatible providers fail. Unsupported provider requests fail clearly.

A snapshot contains `provider`, `resources`, `source`, optional ISO8601 `collectedAt`, `coverage` and `limitations`. Each resource needs `id`, `name` and `type`; common fields are `accountId`, `region`, `group`, `kind`, `properties`, `tags`, `attributes` and `references: [{id, path}]`. Azure normalization maps native fields and keeps compatible extensions. See `examples/subscription.json` and `src/core/interfaces/index.ts`.

`azure_inventory` returns bounded `items`, `total`, `nextOffset`, `snapshotHash`, `collectedAt` and limitations. Default limit is 100, maximum 1000. To review a full live inventory without sending all resources through a model, call a review tool using `subscriptions`. Keep the same snapshot/hash while combining pages; refresh can change offsets. `azure_resource_graph` uses a separate `skipToken` cursor. Collection guards reject missing/repeated continuation tokens and configured limits rather than silently reporting complete inventory.

Review tools summarize all checks and page failed/unknown evidence. `includePassed: true` adds passes. `azure_rbac_audit` and `azure_pim_review` accept one `subscription` UUID plus result pagination. `azure_policy_audit` counts Azure-evaluated states and pages noncompliant/unknown evidence. `azure_cost_analysis` returns month-to-date actual per-currency totals and top 20 resources.

## Organization policy

`learn_organization_policy` accepts exactly one of `controls` or native `definitions`, maximum 2000 entries. `provider` selects native translation, defaulting to Azure. It is the only tool with `readOnlyHint: false` because it writes the configured local/database policy store; it never changes Azure. `search_organization_policy` accepts `query`, optional exact `resourceType` and `limit`. `compare_policy_baseline` evaluates stored normalized controls against a complete snapshot or server-side scope.

Learning is deliberate ingestion, not model training or automatic tenant-wide policy discovery. Azure's evaluated compliance states are retrieved separately by `azure_policy_audit`. [Policy learning](POLICY-LEARNING.md) documents supported expressions, examples and limitations.

## Reports, diagrams and Terraform

`generate_html_report` and `generate_json_report` accept either a complete inventory input or a complete `ICloudReport` in `report`, not both. A paginated MCP review response is not a complete report object. Live report generation uses a scope/subscription; reproducible reporting uses the original complete snapshot. Output includes a filename, MIME type and content. Core report validation/presentation is provider-neutral.

The three diagram tools return nodes, explicit-reference edges and Mermaid text. Terraform tools remain Azure-specific despite their legacy generic names: analysis accepts a JSON `document`; generation accepts `name`, `kind` (`storage`, `keyvault`, `virtual-network`, `app-service`, `virtual-machine`, `sql-database`, `postgresql`, `aks` or `container-app`) and optional `location`. Generation returns `requiredInputs`, `deploymentChecklist`, `policyStatus: "not-evaluated"` and source references alongside the Terraform content. Workload-specific variables such as service versions/sizes, SSH public keys, Entra administrators and subnet IDs must be supplied where required. The generated content has not been evaluated against your complete assigned Azure Policy baseline. No tool runs Terraform or writes an arbitrary server-side path. Save returned artifacts using the client's file/artifact permissions.

Azure MCP resources remain `azure-architect://baseline` and `azure-architect://queries`. The `subscription-review` prompt accepts a subscription UUID and requests evidence-based review. GitHub's cloud agent currently supports tools rather than MCP resources/prompts; ordinary tool calls can perform the same evidence collection. Client support is documented in [Copilot setup](COPILOT.md).

Diagram views group resources by account and resource group/region and use stable node identifiers. `maxNodes` defaults to 200 (allowed 1–1000); omitted nodes/edges and `truncated` are explicit. Narrow the snapshot to see a complete large view.

## Example calls

```json
{"name":"azure_policy_audit","arguments":{"subscription":"00000000-0000-0000-0000-000000000001","limit":100}}
```

```json
{"name":"compare_policy_baseline","arguments":{"provider":"azure","scope":{"accountIds":["00000000-0000-0000-0000-000000000001"]},"limit":100}}
```

```json
{"name":"generate_html_report","arguments":{"provider":"azure","scope":{"accountIds":["00000000-0000-0000-0000-000000000001"]}}}
```

Reference: [official MCP SDK server and transport documentation](https://ts.sdk.modelcontextprotocol.io/server).

