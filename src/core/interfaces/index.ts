/** SDK-free contracts. Provider adapters translate native evidence at this boundary. */
export interface ICloudResource {
  id: string; name: string; type: string;
  accountId?: string; region?: string; group?: string;
  kind?: 'compute' | 'network' | 'identity' | 'data' | 'application' | 'other';
  tags: Record<string, string>; properties: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  references?: Array<{ id: string; path: string }>;
}
export interface ICloudSnapshot {
  provider: string; resources: ICloudResource[]; source: string; collectedAt?: string;
  contentHash: string; coverage: string[]; limitations: string[];
}
/** Provider-native account identifiers (Azure subscriptions today) share one transport contract. */
export interface ICloudScope { accountIds: string[] }
/** Cancellation stops this caller waiting; shared cached collection can continue for other callers. */
export interface InventoryOptions { refresh?: boolean; signal?: AbortSignal }
export interface ICloudInventory {
  getInventory(scope: ICloudScope, options?: InventoryOptions): Promise<ICloudSnapshot>;
}
export interface ICloudCostResult {
  provider: string; timeframe: string; totalsByCurrency: Record<string, number>;
  topResources: Array<{ resourceId: string | null; amount: number; currency: string }>;
  limitations: string[];
}
export interface ICloudCost { getCost(scope: ICloudScope): Promise<ICloudCostResult> }
export interface ICloudControl {
  id: string; title: string; provider?: string; resourceType: string; path: string;
  operator: 'equals' | 'notEquals' | 'in' | 'notIn' | 'exists'; expected: unknown;
  severity?: 'low' | 'medium' | 'high' | 'critical'; source: string;
}
export interface ICloudPolicy {
  importPolicies(definitions: Record<string, unknown>[]): {
    controls: ICloudControl[]; unsupported: Array<{ id: string; reason: string }>;
  };
}
export interface IPolicyStore {
  learn(controls: ICloudControl[]): Promise<{ imported: number; changed: number; unchanged: number }>;
  all(): Promise<ICloudControl[]>;
  search(query?: string, resourceType?: string, limit?: number): Promise<{ total: number; controls: ICloudControl[]; truncated: boolean }>;
  close(): Promise<void>;
}
export interface IFinding {
  id: string; control: string; resourceId: string; resourceName: string; category: string;
  severity: string; status: 'pass' | 'fail' | 'unknown'; title: string;
  evidence: { path: string; expected: unknown; actual: unknown };
  recommendation: string; source: string;
}
export interface ICloudReport {
  schemaVersion: '1.0'; provider?: string; category: string; source: string;
  collectedAt: string | null; snapshotHash: string; resourceCount: number;
  summary: { pass: number; fail: number; unknown: number; evaluated: number; total: number; observedPassPercentage: number | null };
  findings: IFinding[]; limitations: string[];
}
export interface ICloudProvider extends ICloudInventory, ICloudCost, ICloudPolicy {
  readonly id: string;
  normalize(input: unknown): ICloudSnapshot;
  review(snapshot: ICloudSnapshot, category?: string): ICloudReport;
}
