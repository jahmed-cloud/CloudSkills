# Question bank

Use the branches that apply to the chosen service kinds, in this order. For each question, check the listed evidence first; ask only what the evidence leaves open. Recommendations are typical starting points, not defaults to apply without asking. Adapt them to the policy constraints and workload you found.

## 1. Scope and ownership

| Ask | Why it matters | Check first |
|---|---|---|
| Who uses it, and is it internal, partner-facing or public? | Drives exposure, authentication and data classification. | Request wording, repository README |
| Which environment is this: dev, test or production? Are other environments planned? | Changes availability, cost and approval expectations. | Existing environment naming in the subscription |
| Which subscription and resource group? New or existing? | Policy assignments and quotas are scoped there. | Subscription list, resource groups |
| Who owns it, and which cost center pays for it? | Ownership and allocation tags are often required by policy. | Required-tag policies, organization controls |
| What data does it handle, and how is that data classified? | Drives residency, encryption, network isolation and retention. | Organization controls |
| Is there a deadline or a compliance review gate? | Determines what can stay `open` and what must be decided now. | — |

## 2. Region and residency

| Ask | Why it matters | Check first |
|---|---|---|
| Where must the data and compute live? | Allowed-locations policies deny other regions. | Allowed-locations assignment |
| Where are the users, and how sensitive are they to latency? | Region choice and edge services. | — |
| Is a second region needed for recovery? | Paired-region design affects cost and data replication. | Recovery objectives (branch 7) |

Usual recommendation: the closest allowed region that supports the chosen SKU and availability zones.

## 3. Hosting model (web apps and APIs)

| Ask | Why it matters | Check first |
|---|---|---|
| Is the app packaged as a container, or deployed as code? | App Service runs code or containers; Container Apps and AKS need images. | Dockerfile or build pipeline in the repository |
| Which runtime and version? | Must be supported by the region and the provider version; lifecycle dates matter. | Project files (`package.json`, `.csproj`, `requirements.txt`) |
| Are there background jobs, queues, WebSockets or long-running requests? | Rules out or adds services and scaling rules. | Code, existing architecture |
| Can it scale to zero, or must it stay warm? | Cold start versus idle cost. | Usage pattern (branch 8) |
| Does the team already run Kubernetes? | AKS carries real operational cost. | Existing AKS clusters in the estate |

Usual recommendation: code-based web apps on App Service; containerized or event-driven services on Container Apps; AKS only when the team needs Kubernetes features and can operate it.

App Service template inputs to resolve: `app_service_sku` (paid Linux plan with Always On and Private Endpoint support), `node_version`, `integration_subnet_id`, `private_endpoint_subnet_id`, `private_dns_zone_ids`.
Container Apps template inputs to resolve: `infrastructure_subnet_id` (delegated, at least /27), `container_image` (pinned by digest), `container_port`.

## 4. Network exposure

| Ask | Why it matters | Check first |
|---|---|---|
| Who calls it: the internet, the corporate network, or other services only? | Public versus private ingress. | Public-network-access and private-endpoint policies |
| If internet-facing, through what edge: Front Door or Application Gateway with WAF? | WAF requirements and cost. | Organization controls, existing gateways |
| Which VNet, and do the delegated integration and private-endpoint subnets already exist? | Templates need existing subnet IDs. | Inventory: VNets, subnets, delegations |
| Are the private DNS zones (for example `privatelink.azurewebsites.net`) available and linked to client networks? | Private endpoints do not resolve without them. | Inventory: private DNS zones and VNet links |
| What does it call outbound, and does egress go through a firewall or route table? | Blocked platform egress breaks deployments and runtime. | Route tables, firewall policies |

Usual recommendation: private ingress with a private endpoint, VNet integration for outbound traffic, and a WAF-protected edge only when external users need access.

## 5. Identity and access

| Ask | Why it matters | Check first |
|---|---|---|
| How do end users sign in: Entra ID, external identities, or not at all? | Authentication configuration and app registration. | Organization controls |
| Which Azure resources does the app call, and with what permissions? | Managed identity and least-privilege role assignments. | Planned dependencies |
| System-assigned or user-assigned managed identity? | User-assigned identities survive redeployment and can be shared deliberately. | — |
| Which identity deploys it: a pipeline service principal or workload identity federation? | Deployment permissions and secret handling. | Existing pipelines |
| Who has administrative access, and through PIM? | Standing privilege versus just-in-time access. | `azure_rbac_audit`, `azure_pim_review` |

Usual recommendation: Entra ID sign-in, a managed identity for every service-to-service call, no shared keys, and deployment through workload identity federation.

## 6. Data and secrets

| Ask | Why it matters | Check first |
|---|---|---|
| Does it store data? Relational, documents, files or cache? | Selects `sql-database`, `postgresql` or `storage`. | Code, schema files |
| Can database authentication be Entra-only? | The database templates assume Entra authentication without passwords. | Application driver support |
| How long is data retained, and how is it backed up and restored? | Retention and backup settings, and recovery testing. | Organization controls |
| Where do secrets live? | Key Vault references instead of plain app settings. | Existing Key Vaults |

## 7. Availability and recovery

| Ask | Why it matters | Check first |
|---|---|---|
| What availability target applies? As a percentage, not "high". | Zone redundancy, instance count, SKU. | Service-level agreements in use |
| What are the RTO and RPO, in minutes? | Backup frequency and multi-region design. | — |
| Is zone redundancy required? | Needs supported SKUs and regions, and costs more. | Region and SKU support |
| Has restore been tested, and who tests it? | An untested backup is not a recovery plan. | — |

## 8. Scale and performance

| Ask | Why it matters | Check first |
|---|---|---|
| What are the expected normal and peak load, in users or requests per second? | Sizing and autoscale rules. | Existing telemetry for similar apps |
| What are the minimum and maximum instance or replica counts? | Cost floor and cost ceiling. | Budget (branch 10) |
| Which response time is acceptable? | Performance tests and SKU choice. | — |

## 9. Operations

| Ask | Why it matters | Check first |
|---|---|---|
| Which Log Analytics workspace receives logs? | Diagnostic-settings policies may send logs there automatically. | DeployIfNotExists policies, existing workspaces |
| Is Application Insights needed, and which alerts go to whom? | On-call ownership. | — |
| Who patches runtimes and tracks their end-of-life dates? | Unsupported runtimes stop receiving fixes. | — |
| Are deployment slots or revisions needed for zero-downtime releases? | SKU and pipeline design. | — |

## 10. Cost

| Ask | Why it matters | Check first |
|---|---|---|
| What is the monthly budget for each environment? | Bounds SKU, redundancy and edge choices. | `azure_cost_analysis` for comparable workloads |
| Which trade-offs are acceptable: zone redundancy, WAF, private endpoints? | Each one adds recurring cost. | — |
| Can non-production environments scale down outside working hours? | Often the largest saving. | — |

Never quote prices as facts. Label estimates with their source and date.

## 11. Delivery

| Ask | Why it matters | Check first |
|---|---|---|
| Which repository holds the infrastructure code? | Where generated code will live. | Workspace |
| Where is Terraform state stored, and who can read it? | State can contain secrets. | Existing backends |
| Which pipeline deploys it, and can its agent reach private endpoints? | Private services need a private deployment path. | Existing pipelines and agent pools |
| What approval gates apply before production? | Plan review and change management. | Organization controls |
| Which naming convention applies? | Names must be valid, unique and consistent. | Naming policies, existing resources |

## Other kinds, in brief

- **Storage:** access tier, redundancy (LRS, ZRS, GRS), shared-key access disabled, private endpoint per sub-resource (blob, file, queue), lifecycle and immutability rules, soft delete.
- **Key Vault:** RBAC authorization, purge protection, soft-delete retention, private endpoint, who may read secrets.
- **Virtual network:** address space that does not overlap existing networks, subnet plan and delegations, hub peering, route tables and firewall, DNS servers.
- **Virtual machine:** image and patching ownership, SSH public key only, no public IP, backup policy, Bastion or just-in-time access.
- **AKS:** Kubernetes experience, private cluster, Entra admin groups, node pool sizing, network plugin, image registry access, upgrade cadence.
