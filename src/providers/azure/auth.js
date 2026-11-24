export async function azureCredential() {
  const { DefaultAzureCredential } = await import('@azure/identity');
  return new DefaultAzureCredential();
}
export function allowedSubscriptions(requested, configured = process.env.AZURE_SUBSCRIPTIONS || '') {
  const allowed = configured.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  const ids = requested.map(v => v.toLowerCase());
  if (!ids.length || ids.some(id => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))) throw new Error('Provide valid subscription UUIDs');
  if (!allowed.length || ids.some(id => !allowed.includes(id))) throw new Error('Subscription is not in the server AZURE_SUBSCRIPTIONS allowlist');
  return [...new Set(ids)];
}
