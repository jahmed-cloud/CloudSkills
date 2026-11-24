import type { ICloudProvider, ICloudSnapshot } from './interfaces/index.ts';

export class ProviderRegistry {
  private readonly adapters = new Map<string, ICloudProvider>();
  readonly defaultId: string;
  constructor(providers: ICloudProvider[], defaultId: string) {
    for (const provider of providers) {
      if (this.adapters.has(provider.id)) throw new Error(`Duplicate provider: ${provider.id}`);
      this.adapters.set(provider.id, provider);
    }
    this.defaultId = defaultId;
    this.get(defaultId);
  }
  get(id = this.defaultId): ICloudProvider {
    const provider = this.adapters.get(id);
    if (!provider) throw new Error(`Unsupported provider: ${id}; configured: ${[...this.adapters.keys()].join(', ')}`);
    return provider;
  }
  forSnapshot(snapshot: Partial<ICloudSnapshot>, explicit?: string): ICloudProvider {
    const declared = snapshot.provider && snapshot.provider !== 'unknown' ? snapshot.provider : undefined;
    if (explicit && declared && explicit !== declared) throw new Error('Snapshot provider does not match requested provider');
    return this.get(explicit || declared);
  }
}
