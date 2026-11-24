import test from 'node:test';
import assert from 'node:assert/strict';
import { terraformGenerate, terraformAnalyze, terraformOptions } from '../src/providers/azure/terraform.js';

const kinds = {
  storage: 'azurerm_storage_account', keyvault: 'azurerm_key_vault', 'virtual-network': 'azurerm_virtual_network',
  'app-service': 'azurerm_linux_web_app', 'virtual-machine': 'azurerm_linux_virtual_machine',
  'sql-database': 'azurerm_mssql_database', postgresql: 'azurerm_postgresql_flexible_server',
  aks: 'azurerm_kubernetes_cluster', 'container-app': 'azurerm_container_app',
};
const generate = kind => {
  const result = terraformGenerate({ name: 'demoresource', kind });
  return { result, document: JSON.parse(result.content) };
};

for (const [kind, type] of Object.entries(kinds)) test(`${kind} generates a reviewable Azure example with explicit prerequisites`, () => {
  const { result, document } = generate(kind);
  assert.ok(document.resource[type]?.main, `Missing ${type}`);
  assert.equal(result.provider, 'azure'); assert.equal(result.policyStatus, 'not-evaluated');
  assert.ok(result.deploymentChecklist.some(item => /organization controls/.test(item)));
  assert.ok(result.deploymentChecklist.some(item => /estimated running cost/.test(item)));
  assert.ok(result.sources.length && result.sources.every(source => ['registry.terraform.io', 'learn.microsoft.com'].includes(new URL(source.url).hostname)));
  assert.ok(result.requiredInputs.some(input => input.name === 'subscription_id'));
  for (const match of result.content.matchAll(/\$\{var\.([a-z_]+)/g)) assert.ok(document.variable[match[1]], `Undeclared variable ${match[1]}`);
  for (const item of result.requiredInputs) assert.ok(document.variable[item.name] && !Object.hasOwn(document.variable[item.name], 'default'));
  assert.ok(!result.content.includes('PRIVATE KEY')); assert.ok(!result.content.includes('administrator_password'));
  assert.ok(!document.resource.azurerm_public_ip);
});

test('legacy storage and Key Vault calls retain defaults and supported static checks', () => {
  const defaultResult = terraformGenerate({ name: 'demoresource' });
  assert.equal(defaultResult.kind, 'storage');
  for (const kind of ['storage', 'keyvault']) {
    const { result, document } = generate(kind);
    assert.equal(document.resource.azurerm_resource_group.main.location, 'eastus');
    const analysis = terraformAnalyze(JSON.parse(result.content));
    assert.ok(analysis.findings.length && analysis.findings.every(finding => finding.status === 'pass'));
  }
});

test('compute examples require private access and workload-specific image/SSH/runtime choices', () => {
  const vm = generate('virtual-machine').document;
  assert.equal(vm.resource.azurerm_linux_virtual_machine.main.disable_password_authentication, true);
  assert.equal(vm.resource.azurerm_linux_virtual_machine.main.admin_ssh_key.public_key, '${var.ssh_public_key}');
  assert.equal(vm.resource.azurerm_linux_virtual_machine.main.source_image_id, '${var.source_image_id}');
  assert.ok(!Object.hasOwn(vm.resource.azurerm_network_interface.main.ip_configuration, 'public_ip_address_id'));
  const app = generate('app-service').document;
  assert.equal(app.resource.azurerm_linux_web_app.main.public_network_access_enabled, false);
  assert.equal(app.resource.azurerm_linux_web_app.main.https_only, true);
  assert.equal(app.resource.azurerm_private_endpoint.main.private_service_connection.subresource_names[0], 'sites');
  assert.equal(app.resource.azurerm_service_plan.main.worker_count, 1);
  assert.equal(app.resource.azurerm_linux_web_app.main.site_config.vnet_route_all_enabled, true);
});

test('database examples use Entra authentication and private networking without password fields', () => {
  const sql = generate('sql-database').document;
  assert.equal(sql.resource.azurerm_mssql_server.main.azuread_administrator.azuread_authentication_only, true);
  assert.equal(sql.resource.azurerm_mssql_server.main.public_network_access_enabled, false);
  assert.equal(sql.resource.azurerm_private_endpoint.main.private_service_connection.subresource_names[0], 'sqlServer');
  assert.equal(sql.resource.azurerm_mssql_database.main.lifecycle.prevent_destroy, true);
  const pg = generate('postgresql').document;
  assert.equal(pg.resource.azurerm_postgresql_flexible_server.main.authentication.password_auth_enabled, false);
  assert.equal(pg.resource.azurerm_postgresql_flexible_server.main.public_network_access_enabled, false);
  assert.equal(pg.resource.azurerm_postgresql_flexible_server.main.delegated_subnet_id, '${var.delegated_subnet_id}');
  assert.equal(pg.resource.azurerm_postgresql_flexible_server_active_directory_administrator.main.principal_type, 'Group');
});

test('container examples keep private ingress/API access and explicit scaling bounds', () => {
  const aks = generate('aks').document.resource.azurerm_kubernetes_cluster.main;
  assert.equal(aks.private_cluster_enabled, true); assert.equal(aks.local_account_disabled, true);
  assert.equal(aks.azure_active_directory_role_based_access_control.azure_rbac_enabled, true);
  assert.equal(aks.default_node_pool.min_count, 1); assert.equal(aks.default_node_pool.max_count, 3);
  assert.equal(aks.default_node_pool.node_public_ip_enabled, false);
  assert.equal(aks.network_profile.outbound_type, 'userDefinedRouting');
  const ca = generate('container-app').document;
  assert.equal(ca.resource.azurerm_container_app_environment.main.internal_load_balancer_enabled, true);
  assert.equal(ca.resource.azurerm_container_app_environment.main.workload_profile[0].workload_profile_type, 'Consumption');
  assert.equal(ca.resource.azurerm_container_app.main.ingress.allow_insecure_connections, false);
  assert.equal(ca.resource.azurerm_container_app.main.template.max_replicas, 3);
  assert.equal(ca.resource.azurerm_container_app.main.template.container.image, '${var.container_image}');
});

test('service input validation rejects unsupported kinds and expression injection', () => {
  assert.equal(terraformOptions.shape.kind.removeDefault().options.length, Object.keys(kinds).length);
  for (const input of [{ name: 'bad${var.secret}' }, { name: 'demoresource', location: '${var.region}' }, { name: 'demoresource', kind: 'aws-vm' }]) assert.throws(() => terraformGenerate(input));
});
