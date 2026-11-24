import { z } from 'zod';
import { configureService } from './services.js';

export function terraformAnalyze(document) {
  const resources = [];
  function moduleResources(module) {
    for (const r of module?.resources || []) if (r.mode !== 'data') resources.push({ address: r.address, type: r.type, values: r.values || {} });
    for (const child of module?.child_modules || []) moduleResources(child);
  }
  if (document.planned_values || document.values) moduleResources((document.planned_values || document.values).root_module);
  else if (document.resource && typeof document.resource === 'object') {
    for (const [type, named] of Object.entries(document.resource)) {
      for (const [name, values] of Object.entries(named)) resources.push({ address: `${type}.${name}`, type, values });
    }
  } else throw new Error('Expected Terraform .tf.json configuration or terraform show -json output; HCL text is not accepted');
  // Never return arbitrary Terraform values: plans and state can contain secrets.
  return { resourceCount: resources.length, resources: resources.map(r => ({ address: r.address, type: r.type })),
    findings: resources.flatMap(r => {
      const checks = {
        azurerm_storage_account: [['https_traffic_only_enabled', true], ['min_tls_version', 'TLS1_2'], ['allow_nested_items_to_be_public', false], ['public_network_access_enabled', false]],
        azurerm_key_vault: [['purge_protection_enabled', true], ['public_network_access_enabled', false], ['rbac_authorization_enabled', true]],
      };
      return (checks[r.type] || []).map(([field, expected]) => {
        const actual = r.values[field]; const known = actual !== undefined && actual !== null && !(typeof actual === 'string' && /\$\{|%\{/.test(actual));
        return { resource: r.address, field, expected, actual: known && ['boolean', 'string'].includes(typeof actual) ? actual : null, status: !known ? 'unknown' : actual === expected ? 'pass' : 'fail' };
      });
    }), limitations: ['Static checks for Key Vault and Storage only. Provider defaults and unresolved expressions are unknown. HCL must be converted to .tf.json or terraform show -json locally; the server never runs Terraform.'] };
}
export const terraformOptions = z.object({
  name: z.string().regex(/^[a-z][a-z0-9]{2,18}$/), location: z.string().regex(/^[a-z]+[a-z0-9]*$/).default('eastus'),
  kind: z.enum(['storage', 'keyvault', 'virtual-network', 'app-service', 'virtual-machine', 'sql-database', 'postgresql', 'aks', 'container-app']).default('storage'),
});
export function terraformGenerate(input) {
  const { name, location, kind } = terraformOptions.parse(input);
  const configuration = {
    terraform: { required_version: '>= 1.6.0, < 2.0.0', required_providers: { azurerm: { source: 'hashicorp/azurerm', version: '>= 4.53.0, < 5.0.0' } } },
    provider: { azurerm: { features: {}, subscription_id: '${var.subscription_id}' } },
    variable: { subscription_id: { type: 'string', description: 'Target subscription; use a reviewed deployment identity.' } },
    resource: { azurerm_resource_group: { main: { name: `${name}-rg`, location } } },
  };
  const common = { name, resource_group_name: '${azurerm_resource_group.main.name}', location: '${azurerm_resource_group.main.location}', tags: { environment: 'example', owner: 'replace-me', costCenter: 'replace-me' } };
  let details = { deploymentChecklist: [], sources: [] };
  if (kind === 'storage') configuration.resource.azurerm_storage_account = { main: { ...common, account_tier: 'Standard', account_replication_type: 'LRS', https_traffic_only_enabled: true, min_tls_version: 'TLS1_2', allow_nested_items_to_be_public: false, public_network_access_enabled: false, shared_access_key_enabled: false } };
  else if (kind === 'keyvault') {
    configuration.data = { azurerm_client_config: { current: {} } };
    configuration.resource.azurerm_key_vault = { main: { ...common, tenant_id: '${data.azurerm_client_config.current.tenant_id}', sku_name: 'standard', purge_protection_enabled: true, soft_delete_retention_days: 90, public_network_access_enabled: false, rbac_authorization_enabled: true } };
  } else details = configureService(configuration, { name, location, kind }, common);
  if (['storage', 'keyvault'].includes(kind)) {
    details.sources.push({ title: `AzureRM ${kind}`, url: `https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/${kind === 'storage' ? 'storage_account' : 'key_vault'}` });
    details.deploymentChecklist.push('Create the required private endpoints and DNS links, grant least-privilege managed-identity roles and test private client access.');
  }
  return { provider: 'azure', kind, policyStatus: 'not-evaluated', filename: 'main.tf.json', content: JSON.stringify(configuration, null, 2),
    requiredInputs: Object.entries(configuration.variable).filter(([, spec]) => !Object.hasOwn(spec, 'default')).map(([key, spec]) => ({ name: key, type: spec.type, description: spec.description })),
    deploymentChecklist: ['Compare the example with learned organization controls and effective Azure Policy assignments/exemptions; this output does not establish compliance.', 'Review region/SKU availability, quotas and estimated running cost; configure a secure remote state backend and validate the resolved provider schema before planning.', ...details.deploymentChecklist, 'Review a Terraform plan and obtain deployment approval before apply; no plan or apply is performed by CloudSkills.'],
    sources: details.sources,
    limitations: ['Reviewable example only; name availability, RBAC, private networking/DNS and workload-specific availability/recovery requirements need validation. No deployment or policy-compliance claim is made.', 'Static terraform_analyze coverage remains limited to selected Storage and Key Vault settings; other service kinds require provider validation and human review.'] };
}
