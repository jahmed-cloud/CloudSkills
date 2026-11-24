# Organization policy learning

CloudSkills can use your organization's approved Azure controls, but installing the skill does not discover or import them automatically. There are two separate evidence paths:

| Path | Tool | What it establishes |
|---|---|---|
| Azure-evaluated policy states | `azure_policy_audit` | Compliance states already evaluated by Azure for the readable subscription; freshness and coverage still need review |
| Explicit organization baseline | `learn_organization_policy`, `search_organization_policy`, `compare_policy_baseline` | Stored approved controls and deterministic comparison with collected properties |

Neither path by itself explains every management-group assignment, initiative, exemption or business exception. Current collectors do not resolve that entire hierarchy. State reads do not automatically import definitions into the local store.

For an example of requesting live policy results from an AI client and how the server handles its Azure token, see the [Cloud Service Builder usage guide](SERVICE-BUILDER.md#read-the-current-azure-policy-results).

## Import approved controls

Learning is deterministic ingestion and retrieval, not model training. Knowledge is stored in `knowledge/organization/policies.db` unless `POLICY_DATABASE` selects another SQLite path or PostgreSQL URL. The server sends clients only returned tool results; an AI client's own handling of those results depends on its configuration and organization settings.

An explicit control uses a stable ID, title, provider, resource type (or `*`), dot-separated property path, operator, expected value, severity and source:

```json
{
  "name": "learn_organization_policy",
  "arguments": {
    "controls": [{
      "id": "ORG-NET-004",
      "title": "Key Vault uses private networking",
      "provider": "azure",
      "resourceType": "Microsoft.KeyVault/vaults",
      "path": "properties.publicNetworkAccess",
      "operator": "equals",
      "expected": "Disabled",
      "severity": "high",
      "source": "Approved network baseline v3, section 4"
    }]
  }
}
```

Operators are `equals`, `notEquals`, `in`, `notIn` and `exists`. Membership takes an array and existence takes a boolean. Strings compare case-insensitively. Dot paths cannot address keys containing literal dots. Absent/null evidence is unknown except explicit existence checks. Specify `provider` to avoid applying a control across future provider adapters unintentionally. Generic resource location is `region`.

Then retrieve and compare:

```json
{"name":"search_organization_policy","arguments":{"query":"private","resourceType":"Microsoft.KeyVault/vaults","limit":10}}
```

```json
{"name":"compare_policy_baseline","arguments":{"provider":"azure","scope":{"accountIds":["00000000-0000-0000-0000-000000000001"]},"includePassed":true,"limit":100}}
```

A user can ask a connected agent: “Import these approved organization controls, show what was supported, then compare subscription <UUID> with that baseline. Cite the source and flag unknown evidence.” Narrative requirements must be turned into explicit approved predicates; an agent should not silently turn ambiguous advice into mandatory controls.

## Native Azure Policy definitions

`learn_organization_policy` also accepts `definitions` and `provider: "azure"`. Import supports exactly two `allOf` predicates: a literal resource-type equality plus a literal tag or location predicate, with `audit` or `deny` effect. Azure rules describe violations; translation inverts the condition into the desired baseline predicate.

Definitions with aliases, parameter/function expressions, initiatives, exemptions, assignment scope resolution, remediation effects or other conditions are returned in `unsupported`. A definition-only comparison is not proof of assigned Azure Policy compliance. For unsupported definitions, preserve Azure-evaluated states and review applicability with the policy owner rather than guessing intent.

## Persistence and boundaries

Canonical JSON and SHA-256 make repeated unchanged imports idempotent. Updating an ID transactionally replaces its body/hash; duplicate batch IDs fail. SQLite uses WAL, a busy timeout and serialized in-process ingestion. PostgreSQL uses database transactions and is loaded only when configured. The core store accepts normalized controls, while Azure-native translation stays under `src/providers/azure/`.

There is no stored version history or approval workflow. Retain authoritative policy sources and approved exceptions through the organization's existing process. Local comparison does not assign policies, deploy changes or remediate resources. CLI `--policy` compares an explicit JSON file and saves `organization-policy.json`; it does not populate the MCP policy database.

Sources: [Azure Policy definition structure](https://learn.microsoft.com/azure/governance/policy/concepts/definition-structure-basics), [Policy rule structure](https://learn.microsoft.com/azure/governance/policy/concepts/definition-structure-policy-rule).
