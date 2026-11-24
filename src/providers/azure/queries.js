export const queries = Object.freeze({
  publicIPs: "Resources | where type =~ 'microsoft.network/publicipaddresses' | project id, name, location, properties.ipAddress",
  keyVaults: "Resources | where type =~ 'microsoft.keyvault/vaults' | project id, name, properties.publicNetworkAccess, properties.enableRbacAuthorization",
  networks: "Resources | where type startswith 'microsoft.network/' | project id, name, type, properties",
});
