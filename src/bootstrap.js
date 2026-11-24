// Composition root: the only shared application layer that selects concrete providers.
import { AzureProvider } from './providers/azure/provider.ts';
import { registerAzureTools } from './providers/azure/tools.js';
import { ProviderRegistry } from './core/providers.ts';

export function createDependencies({ azure, store } = {}) {
  const provider = new AzureProvider(azure);
  return { store, registry: new ProviderRegistry([provider], provider.id), registerProviderTools: server => registerAzureTools(server, provider) };
}
