import type { ICloudControl, ICloudCostResult, ICloudInventory, ICloudPolicy, ICloudProvider, ICloudReport, ICloudSnapshot, InventoryOptions } from '../../src/core/interfaces/index.ts';
import type { AzureProvider } from '../../src/providers/azure/provider.ts';

// Compile-only boundary checks. A provider can satisfy these without an Azure SDK type.
const genericSnapshot: ICloudSnapshot = {
  provider: 'example', source: 'fixture', contentHash: 'hash', coverage: ['resources'], limitations: [],
  resources: [{ id: 'CaseSensitive/Id', name: 'example', type: 'Example.Widget', tags: {}, properties: {}, region: 'region-1', accountId: 'account-1' }],
};
const genericControl: ICloudControl = {
  id: 'ORG-ENCRYPTION', title: 'Encryption', provider: 'example', resourceType: 'Example.Widget',
  path: 'properties.encrypted', operator: 'equals', expected: true, source: 'organization standard',
};

export async function verifyAzureContracts(adapter: AzureProvider) {
  const provider: ICloudProvider = adapter;
  const inventory: ICloudInventory = provider;
  const policy: ICloudPolicy = provider;
  const options: InventoryOptions = { refresh: true, signal: new AbortController().signal };
  const snapshot: ICloudSnapshot = await inventory.getInventory({ accountIds: ['account-1'] }, options);
  const cost: ICloudCostResult = await provider.getCost({ accountIds: ['account-1'] });
  const controls: ICloudControl[] = policy.importPolicies([]).controls;
  const report: ICloudReport = provider.review(snapshot);
  return { snapshot, cost, controls, report };
}

export function verifyGenericContracts(provider: ICloudProvider) {
  provider.normalize(genericSnapshot);
  provider.review(genericSnapshot);
  // @ts-expect-error A native Azure subscription field cannot replace the generic account scope.
  provider.getInventory({ subscriptions: ['subscription-id'] });
  // @ts-expect-error Control evidence requires an explicit expected value.
  const missingExpected: ICloudControl = { id: 'invalid', title: 'Invalid', resourceType: '*', path: 'tags.owner', operator: 'exists', source: 'fixture' };
  return { genericControl, missingExpected };
}
