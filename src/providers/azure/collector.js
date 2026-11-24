import { azureCredential, allowedSubscriptions } from './auth.js';
import { normalize } from './model.js';
import { Cache } from '../../core/cache/index.js';

const ARM = 'https://management.azure.com';
const GRAPH_PATH = '/providers/Microsoft.ResourceGraph/resources?api-version=2024-04-01';
export class AzureReader {
  constructor({ credential, fetcher = fetch, subscriptions = process.env.AZURE_SUBSCRIPTIONS || '', delay = ms => new Promise(r => setTimeout(r, ms)), cache = new Cache(), maxPages = 100, maxResources = 50000 } = {}) {
    if (!Number.isSafeInteger(maxPages) || maxPages < 1 || !Number.isSafeInteger(maxResources) || maxResources < 1 || maxResources > 50000) throw new Error('Invalid Azure collection bounds');
    this.credential = credential; this.fetcher = fetcher; this.subscriptions = subscriptions; this.delay = delay; this.cache = cache;
    this.maxPages = maxPages; this.maxResources = maxResources;
  }
  async request(path, body) {
    // Only explicitly implemented read/query endpoints can reach ARM.
    const permitted = path === GRAPH_PATH || /^\/subscriptions\/[0-9a-f-]+\/providers\/Microsoft\.(Authorization\/(roleAssignments|roleAssignmentScheduleInstances|roleEligibilityScheduleInstances|policyDefinitions)|CostManagement\/query|PolicyInsights\/policyStates\/latest\/queryResults|Advisor\/recommendations)\?/.test(path);
    if (!permitted) throw new Error('Azure endpoint is not a supported read operation');
    this.credential ??= azureCredential();
    const token = await (await this.credential).getToken('https://management.azure.com/.default');
    if (!token) throw new Error('Azure credential did not return a token');
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.fetcher(ARM + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      if ([429, 502, 503, 504].includes(response.status) && attempt < 3) {
        const header = response.headers.get('retry-after');
        const retry = header && /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header || '') - Date.now();
        await response.body?.cancel();
        await this.delay(Math.min(Number.isFinite(retry) && retry > 0 ? retry : 500 * 2 ** attempt, 10000));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Azure read failed (HTTP ${response.status}); verify the subscription and read permissions`);
      }
      return response.status === 204 ? null : response.json();
    }
  }
  async graph(subscriptions, query, { limit = 1000, skipToken } = {}) {
    const ids = allowedSubscriptions(subscriptions, this.subscriptions);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || typeof query !== 'string' || !query.trim() || query.length > 20000 || (skipToken !== undefined && (typeof skipToken !== 'string' || !skipToken))) throw new Error('Invalid Azure Resource Graph query or pagination options');
    const page = await this.request(GRAPH_PATH, { subscriptions: ids, query, options: { resultFormat: 'objectArray', $top: limit, ...(skipToken ? { $skipToken: skipToken } : {}) } });
    if (!Array.isArray(page?.data) || (page.$skipToken !== undefined && typeof page.$skipToken !== 'string')) throw new Error('Azure Resource Graph returned an invalid page');
    return page;
  }
  async *graphPages(subscriptions, query) {
    let skipToken; const seen = new Set(); let rows = 0;
    for (let i = 0; i < this.maxPages; i++) {
      const page = await this.graph(subscriptions, query, { skipToken });
      rows += page.data.length;
      if (rows > this.maxResources) throw new Error('Inventory exceeds resource limit; narrow the subscription scope');
      const next = page.$skipToken;
      if (next && seen.has(next)) throw new Error('Repeated Azure pagination token');
      if (!next && String(page.resultTruncated).toLowerCase() === 'true') throw new Error('Azure returned truncated inventory without continuation; narrow the scope');
      yield page;
      if (!next) return;
      if (rows >= this.maxResources) throw new Error('Inventory exceeds resource limit; narrow the subscription scope');
      seen.add(next); skipToken = next;
    }
    throw new Error('Azure pagination exceeded its safe limit');
  }
  /**
   * @param {string[]} subscriptions
   * @param {import('../../core/interfaces/index.ts').InventoryOptions} [options]
   * @returns {Promise<import('../../core/interfaces/index.ts').ICloudSnapshot & {cached?: boolean}>}
   */
  async inventory(subscriptions, { refresh = false, signal } = {}) {
    const ids = allowedSubscriptions(subscriptions, this.subscriptions);
    signal?.throwIfAborted();
    const key = ids.sort().join(',');
    const work = this.cache.getOrLoad(key, async () => {
      const resources = [];
      for await (const page of this.graphPages(ids, 'Resources | project id, name, type, location, subscriptionId, resourceGroup, tags, properties, identity, sku | order by id asc')) {
        for (const resource of page.data) resources.push(Object.fromEntries(Object.entries(resource).filter(([, v]) => v !== null)));
      }
      return normalize({ resources, source: 'azure', collectedAt: new Date().toISOString(), coverage: ['resources'], limitations: ['Resource Graph is eventually consistent; Entra directory, guest OS, data-plane configuration and inherited management-group permissions are not collected.'] });
    }, { refresh });
    // A caller can stop waiting without cancelling a collection shared by other callers.
    let abort;
    const aborted = signal && new Promise((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); });
    try { const { value, cached } = await (aborted ? Promise.race([work, aborted]) : work); return { ...value, cached }; }
    finally { if (abort) signal.removeEventListener('abort', abort); }
  }
  async list(subscription, kind) {
    const [id] = allowedSubscriptions([subscription], this.subscriptions);
    const endpoints = {
      rbac: ['Microsoft.Authorization/roleAssignments?api-version=2022-04-01'],
      pimActive: ['Microsoft.Authorization/roleAssignmentScheduleInstances?api-version=2020-10-01'],
      pimEligible: ['Microsoft.Authorization/roleEligibilityScheduleInstances?api-version=2020-10-01'],
      definitions: ['Microsoft.Authorization/policyDefinitions?api-version=2023-04-01'],
      advisor: ['Microsoft.Advisor/recommendations?api-version=2025-01-01'],
      policyStates: ['Microsoft.PolicyInsights/policyStates/latest/queryResults?api-version=2019-10-01', {}],
      costs: ['Microsoft.CostManagement/query?api-version=2025-03-01', { type: 'ActualCost', timeframe: 'MonthToDate', dataset: { granularity: 'None', aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } }, grouping: [{ type: 'Dimension', name: 'ResourceId' }] } }],
    };
    if (!Object.hasOwn(endpoints, kind)) throw new Error('Unknown collector');
    const [endpoint, body] = endpoints[kind];
    const base = `/subscriptions/${id}/providers/${endpoint}`;
    let path = base; const rows = []; const seen = new Set(); let columns;
    do {
      if (seen.has(path) || seen.size >= this.maxPages) throw new Error('Azure pagination exceeded its safe limit');
      seen.add(path);
      const result = await this.request(path, body);
      if (result === null && kind === 'costs' && seen.size === 1) return { columns: [], rows: [], noData: true };
      if (kind === 'costs') {
        if (!Array.isArray(result?.properties?.rows) || !Array.isArray(result.properties.columns)) throw new Error('Azure cost query returned an invalid page');
        if (columns && JSON.stringify(columns) !== JSON.stringify(result.properties.columns)) throw new Error('Azure cost columns changed during pagination');
        for (const row of result.properties.rows) rows.push(row);
        columns = result.properties.columns;
      } else {
        if (!Array.isArray(result?.value)) throw new Error('Azure read returned an invalid list');
        for (const row of result.value) rows.push(row);
      }
      if (rows.length > 100000) throw new Error('Azure list exceeds 100,000 records; narrow the scope');
      const next = result.nextLink || result['@odata.nextLink'] || result.properties?.nextLink;
      if (next) {
        const url = new URL(next, ARM);
        if (url.origin !== ARM || url.pathname !== base.split('?')[0]) throw new Error('Unexpected Azure pagination destination');
        path = url.pathname + url.search;
      } else path = undefined;
    } while (path);
    return columns ? { columns, rows } : rows;
  }
}
