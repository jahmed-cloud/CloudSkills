// Azure-only Terraform examples. Required workload choices remain Terraform inputs.
const variable = name => '${var.' + name + '}';
const resource = name => '${' + name + '}';
const reference = kind => ({ title: `AzureRM ${kind}`, url: `https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/${kind}` });

export function configureService(configuration, { name, kind }, common) {
  const resources = configuration.resource; const checklist = []; const sources = [];
  const add = (key, type, description, validation) => {
    configuration.variable[key] = { type, description, nullable: false, ...(validation ? { validation } : {}) };
    return variable(key);
  };
  const positive = key => ({ condition: '${var.' + key + ' > 0 && floor(var.' + key + ') == var.' + key + '}', error_message: `${key} must be a positive integer.` });
  const subnet = (key = 'subnet_id', description = 'Existing subnet ID with reviewed NSG, routing and private administration connectivity.') => add(key, 'string', description);
  const client = () => { configuration.data = { ...configuration.data, azurerm_client_config: { current: {} } }; };
  const admin = () => {
    client();
    add('entra_admin_object_id', 'string', 'Object ID of the approved Entra administrator group in this tenant.');
    add('entra_admin_name', 'string', 'Display/login name of the approved Entra administrator group.');
  };
  const endpoint = (id, subresource) => {
    resources.azurerm_private_endpoint = { main: { ...common, name: `${name}-pe`, subnet_id: subnet('private_endpoint_subnet_id', 'Existing nondelegated private endpoint subnet ID; review NSG policies and private routing.'),
      private_service_connection: { name: `${name}-private`, private_connection_resource_id: id, subresource_names: [subresource], is_manual_connection: false },
      private_dns_zone_group: { name: 'main', private_dns_zone_ids: add('private_dns_zone_ids', 'list(string)', `Existing private DNS zone IDs for ${subresource}, linked to client VNets; supply at least one.`, { condition: '${length(var.private_dns_zone_ids) > 0}', error_message: 'Supply the service private DNS zone IDs.' }) } } };
    sources.push(reference('private_endpoint'));
    checklist.push('Verify private DNS zones and VNet links, private endpoint approval and client connectivity; run the deployment agent on a reachable network.');
  };

  if (kind === 'virtual-network') {
    resources.azurerm_virtual_network = { main: { ...common, name: `${name}-vnet`, address_space: add('address_space', 'list(string)', 'Approved nonoverlapping VNet IPv4 CIDR ranges.', { condition: '${length(var.address_space) > 0 && alltrue([for cidr in var.address_space : can(cidrnetmask(cidr))])}', error_message: 'Supply at least one valid IPv4 CIDR.' }) } };
    resources.azurerm_subnet = { main: { name: 'workload', resource_group_name: common.resource_group_name, virtual_network_name: resource('azurerm_virtual_network.main.name'), default_outbound_access_enabled: false, address_prefixes: add('subnet_prefixes', 'list(string)', 'Workload subnet IPv4 CIDRs contained within the VNet ranges.', { condition: '${length(var.subnet_prefixes) > 0 && alltrue([for cidr in var.subnet_prefixes : can(cidrnetmask(cidr))])}', error_message: 'Supply at least one valid IPv4 subnet CIDR.' }) } };
    resources.azurerm_network_security_group = { main: { ...common, name: `${name}-nsg`, security_rule: [{ name: 'DenyInternetInbound', priority: 100, direction: 'Inbound', access: 'Deny', protocol: '*', source_port_range: '*', destination_port_range: '*', source_address_prefix: 'Internet', destination_address_prefix: '*' }] } };
    resources.azurerm_subnet_network_security_group_association = { main: { subnet_id: resource('azurerm_subnet.main.id'), network_security_group_id: resource('azurerm_network_security_group.main.id') } };
    checklist.push('Confirm address-space containment and overlap against on-premises, peered networks and reserved service ranges.', 'Add workload-specific NSG rules, DNS, routes, controlled egress and peering; the template includes no hub connectivity.');
    sources.push(reference('virtual_network'), reference('subnet'), reference('network_security_group'));
  } else if (kind === 'app-service') {
    resources.azurerm_service_plan = { main: { ...common, name: `${name}-plan`, os_type: 'Linux', sku_name: add('app_service_sku', 'string', 'Region-supported paid Linux plan SKU with Always On and Private Endpoint support; validate cost and capacity.'), worker_count: 1 } };
    resources.azurerm_linux_web_app = { main: { ...common, service_plan_id: resource('azurerm_service_plan.main.id'), https_only: true, public_network_access_enabled: false,
      ftp_publish_basic_authentication_enabled: false, webdeploy_publish_basic_authentication_enabled: false, identity: { type: 'SystemAssigned' }, virtual_network_subnet_id: subnet('integration_subnet_id', 'Existing Microsoft.Web/serverFarms-delegated subnet with reviewed UDR/firewall and required platform egress.'),
      site_config: { minimum_tls_version: '1.2', scm_minimum_tls_version: '1.2', ftps_state: 'Disabled', always_on: true, vnet_route_all_enabled: true,
        application_stack: { node_version: add('node_version', 'string', 'Node runtime supported by the selected AzureRM version and App Service region; review the lifecycle before choosing.') } } } };
    endpoint(resource('azurerm_linux_web_app.main.id'), 'sites');
    checklist.push('Deploy application code through a private deployment path; no application package, authentication provider or app secrets are included.', 'Review outbound VNet integration, application identity roles, diagnostics, capacity scaling and custom domain/TLS requirements. The plan starts with one worker.');
    sources.push(reference('service_plan'), reference('linux_web_app'));
  } else if (kind === 'virtual-machine') {
    const username = add('admin_username', 'string', 'Approved non-root Linux administrator username.');
    resources.azurerm_network_interface = { main: { ...common, name: `${name}-nic`, ip_configuration: { name: 'private', subnet_id: subnet(), private_ip_address_allocation: 'Dynamic' } } };
    resources.azurerm_linux_virtual_machine = { main: { ...common, size: add('vm_size', 'string', 'Region-supported VM SKU selected using utilization and budget evidence.'), admin_username: username,
      network_interface_ids: [resource('azurerm_network_interface.main.id')], disable_password_authentication: true,
      admin_ssh_key: { username, public_key: add('ssh_public_key', 'string', 'Existing SSH public key only; never supply private key material.', { condition: '${can(regex("^(ssh-rsa|ssh-ed25519) [A-Za-z0-9+/=]+", trimspace(var.ssh_public_key)))}', error_message: 'Supply an RSA or Ed25519 SSH public key, never a private key.' }) },
      os_disk: { caching: 'ReadWrite', storage_account_type: 'StandardSSD_LRS' }, source_image_id: add('source_image_id', 'string', 'Reviewed Azure image or image-version resource ID compatible with the chosen VM SKU.'), identity: { type: 'SystemAssigned' } } };
    checklist.push('No public IP or inbound SSH rule is created. Validate Bastion/VPN/private administration and subnet NSG restrictions before deploying.', 'Review image lifecycle, disk sizing, patching, backup, monitoring, availability and managed-identity role assignments. One VM is an example, not a high-availability design.');
    sources.push(reference('linux_virtual_machine'), reference('network_interface'));
  } else if (kind === 'sql-database') {
    admin();
    resources.azurerm_mssql_server = { main: { ...common, version: '12.0', minimum_tls_version: '1.2', public_network_access_enabled: false, outbound_network_restriction_enabled: true, identity: { type: 'SystemAssigned' },
      azuread_administrator: { login_username: variable('entra_admin_name'), object_id: variable('entra_admin_object_id'), tenant_id: resource('data.azurerm_client_config.current.tenant_id'), azuread_authentication_only: true } } };
    resources.azurerm_mssql_database = { main: { name: `${name}-db`, server_id: resource('azurerm_mssql_server.main.id'), sku_name: add('database_sku', 'string', 'Supported Azure SQL Database SKU; choose using workload evidence and budget.'), max_size_gb: add('max_size_gb', 'number', 'Database maximum size in GB, compatible with the selected SKU.', positive('max_size_gb')), tags: common.tags, lifecycle: { prevent_destroy: true } } };
    endpoint(resource('azurerm_mssql_server.main.id'), 'sqlServer');
    checklist.push('Entra-only authentication requires approved directory permissions and client token support; provision least-privilege database roles.', 'Verify backup/PITR and retention, zone/geo recovery requirements, database capacity, budgets and auditing; test restore before production.');
    sources.push(reference('mssql_server'), reference('mssql_database'));
  } else if (kind === 'postgresql') {
    admin();
    resources.azurerm_postgresql_flexible_server = { main: { ...common, version: add('postgresql_version', 'string', 'PostgreSQL major version currently supported in the target Azure region.'), sku_name: add('postgresql_sku', 'string', 'Supported PostgreSQL Flexible Server SKU reviewed for utilization and cost.'),
      storage_mb: add('storage_mb', 'number', 'Storage MB supported by the selected PostgreSQL SKU.', positive('storage_mb')), backup_retention_days: 7,
      delegated_subnet_id: subnet('delegated_subnet_id', 'Existing subnet exclusively delegated to Microsoft.DBforPostgreSQL/flexibleServers.'), private_dns_zone_id: add('private_dns_zone_id', 'string', 'Existing private zone ID ending in .postgres.database.azure.com, already linked to client VNets.'), public_network_access_enabled: false,
      authentication: { active_directory_auth_enabled: true, password_auth_enabled: false, tenant_id: resource('data.azurerm_client_config.current.tenant_id') }, lifecycle: { prevent_destroy: true } } };
    resources.azurerm_postgresql_flexible_server_active_directory_administrator = { main: { server_name: resource('azurerm_postgresql_flexible_server.main.name'), resource_group_name: common.resource_group_name,
      tenant_id: resource('data.azurerm_client_config.current.tenant_id'), object_id: variable('entra_admin_object_id'), principal_name: variable('entra_admin_name'), principal_type: 'Group' } };
    checklist.push('Validate subnet delegation, address capacity, private DNS links, routing and required PostgreSQL Entra service-principal/directory permissions.', 'Use Entra token-capable clients and least-privilege database roles. Review high availability, supported engine versions, backups and restore objectives; the seven-day retention is an example.');
    sources.push(reference('postgresql_flexible_server'), reference('postgresql_flexible_server_active_directory_administrator'));
  } else if (kind === 'aks') {
    resources.azurerm_kubernetes_cluster = { main: { ...common, dns_prefix: name, kubernetes_version: add('kubernetes_version', 'string', 'AKS Kubernetes version currently supported in the target region; review upgrade policy.'),
      private_cluster_enabled: true, private_cluster_public_fqdn_enabled: false, local_account_disabled: true, role_based_access_control_enabled: true, oidc_issuer_enabled: true, workload_identity_enabled: true,
      identity: { type: 'UserAssigned', identity_ids: [add('aks_identity_id', 'string', 'Existing user-assigned identity ID with reviewed subnet, routing and AKS private-DNS permissions.')] },
      azure_active_directory_role_based_access_control: { azure_rbac_enabled: true, admin_group_object_ids: add('entra_admin_group_ids', 'list(string)', 'Approved Entra administrator group object IDs; configure Azure Kubernetes RBAC roles.', { condition: '${length(var.entra_admin_group_ids) > 0}', error_message: 'Supply at least one approved Entra administrator group.' }) },
      default_node_pool: { name: 'system', vm_size: add('node_vm_size', 'string', 'AKS-supported system-node SKU with sufficient CPU and memory; review pricing.'), vnet_subnet_id: subnet('node_subnet_id', 'Existing AKS node subnet with a reviewed UDR and controlled Azure service egress.'), auto_scaling_enabled: true, min_count: 1, max_count: 3, node_public_ip_enabled: false, temporary_name_for_rotation: 'rotation' },
      network_profile: { network_plugin: 'azure', network_plugin_mode: 'overlay', outbound_type: 'userDefinedRouting', pod_cidr: add('pod_cidr', 'string', 'Nonoverlapping IPv4 overlay pod CIDR.'), service_cidr: add('service_cidr', 'string', 'Nonoverlapping IPv4 Kubernetes service CIDR.'), dns_service_ip: add('dns_service_ip', 'string', 'Usable DNS service address inside the service CIDR.') } } };
    checklist.push('Provide the preauthorized identity, UDR/firewall egress, private DNS resolution and a privately connected deployment agent before cluster creation.', 'The system pool scales between one and three nodes. Review production node minimums/zones, SLA tier, quotas, workload limits, ingress, network policies, image-pull access, monitoring and disaster recovery.', 'Assign approved Azure Kubernetes RBAC roles; validate OIDC federation for each workload identity and test private API access.');
    sources.push(reference('kubernetes_cluster'));
  } else if (kind === 'container-app') {
    resources.azurerm_container_app_environment = { main: { ...common, name: `${name}-env`, infrastructure_subnet_id: subnet('infrastructure_subnet_id', 'Existing Microsoft.App/environments-delegated subnet, at least /27, with reviewed UDR/firewall and required platform egress.'), internal_load_balancer_enabled: true, workload_profile: [{ name: 'Consumption', workload_profile_type: 'Consumption' }] } };
    resources.azurerm_container_app = { main: { name, resource_group_name: common.resource_group_name, container_app_environment_id: resource('azurerm_container_app_environment.main.id'), revision_mode: 'Single', identity: { type: 'SystemAssigned' }, tags: common.tags,
      ingress: { external_enabled: true, allow_insecure_connections: false, target_port: add('container_port', 'number', 'HTTP port exposed by the reviewed image.', { condition: '${var.container_port >= 1 && var.container_port <= 65535 && floor(var.container_port) == var.container_port}', error_message: 'Container port must be an integer from 1 to 65535.' }), traffic_weight: { latest_revision: true, percentage: 100 } },
      template: { min_replicas: 1, max_replicas: 3, container: { name: 'app', image: add('container_image', 'string', 'Reviewed public/accessible container image, preferably pinned by immutable digest; private registries require additional managed-identity configuration.'), cpu: 0.25, memory: '0.5Gi' } } } };
    checklist.push('The environment uses an internal load balancer. Ingress is reachable outside the environment only on its private VNet; configure private DNS, routing and client access.', 'Review image provenance, registry identity/pull permissions, application authentication and secrets references, readiness/liveness probes, diagnostics and egress.', 'The example bounds replicas to one through three at 0.25 vCPU/0.5Gi each. Validate workload sizing and scaling rules before use.');
    sources.push(reference('container_app_environment'), reference('container_app'), { title: 'Container Apps controlled outbound routing', url: 'https://learn.microsoft.com/en-us/azure/container-apps/user-defined-routes' });
  } else throw new Error(`Unsupported Azure service kind: ${kind}`);
  return { deploymentChecklist: checklist, sources };
}
