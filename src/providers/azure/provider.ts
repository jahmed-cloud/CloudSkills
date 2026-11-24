import type { ICloudProvider, ICloudInventory, ICloudCost, ICloudPolicy, ICloudScope, InventoryOptions, ICloudSnapshot, ICloudReport, ICloudCostResult } from '../../core/interfaces/index.ts';
import { AzureReader } from './collector.js';
import { normalize } from './model.js';
import { audit, costAnalysis } from './analyzers.js';
import { importDefinitions } from './policy.js';

export class AzureProvider implements ICloudProvider, ICloudInventory, ICloudCost, ICloudPolicy {
  readonly id = 'azure';
  readonly reader: AzureReader;
  constructor(reader = new AzureReader()) { this.reader = reader; }
  normalize(input: unknown): ICloudSnapshot { return normalize(input); }
  async getInventory(scope: ICloudScope, options: InventoryOptions = {}): Promise<ICloudSnapshot> {
    return this.reader.inventory(scope.accountIds, options);
  }
  async getCost(scope: ICloudScope): Promise<ICloudCostResult> {
    if (scope.accountIds.length !== 1) throw new Error('Provide exactly one account for cost analysis');
    return { provider: this.id, ...costAnalysis(await this.reader.list(scope.accountIds[0], 'costs')) };
  }
  importPolicies(definitions: Record<string, unknown>[]) { return importDefinitions(definitions); }
  review(snapshot: ICloudSnapshot, category = 'architecture'): ICloudReport { return audit(snapshot, category); }
}
