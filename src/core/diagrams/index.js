import { normalize, hash } from '../model.js';

const label = text => String(text).replace(/[^a-zA-Z0-9 ._:/-]/g, '_').slice(0, 120);
const colors = { compute: '#dbeafe', network: '#ccfbf1', identity: '#ede9fe', data: '#fef3c7', application: '#e0f2fe', other: '#f1f5f9' };
/** @param {import('../interfaces/index.ts').ICloudSnapshot} input */
export function diagram(input, kind = 'architecture', { maxNodes = 200 } = {}) {
  if (!['architecture', 'network', 'identity'].includes(kind)) throw new Error('Unsupported diagram kind');
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 1000) throw new Error('Diagram maxNodes must be 1-1000');
  const snapshot = normalize(input);
  const selected = snapshot.resources.filter(r => kind === 'architecture' || r.kind === kind || (kind === 'identity' && r.attributes?.identity));
  const visible = selected.slice(0, maxNodes);
  const nodes = visible.map(r => ({ key: `n${hash(r.id).slice(0, 16)}`, id: r.id, label: r.name, type: r.type, kind: r.kind || 'other', group: [r.accountId || snapshot.provider, r.group || r.region || 'Ungrouped'].join(' / ') }));
  const keys = new Map(nodes.map(n => [n.id, n.key])); const allIds = new Set(selected.map(r => r.id));
  const edges = []; const seen = new Set(); let omittedEdges = 0;
  for (const resource of selected) for (const ref of resource.references || []) {
    if (ref.id === resource.id || !allIds.has(ref.id)) continue;
    const signature = hash([resource.id, ref.id, ref.path]);
    if (seen.has(signature)) continue; seen.add(signature);
    if (!keys.has(resource.id) || !keys.has(ref.id)) { omittedEdges++; continue; }
    edges.push({ from: keys.get(resource.id), to: keys.get(ref.id), label: ref.path });
  }
  const groups = Map.groupBy(nodes, n => n.group);
  const lines = ['flowchart LR'];
  for (const [group, members] of groups) {
    lines.push(`  subgraph g${hash(group).slice(0, 16)}["${label(group)}"]`, '    direction TB');
    for (const n of members) lines.push(`    ${n.key}["${label(n.label)}<br/>${label(n.type)}"]:::${n.kind}`);
    lines.push('  end');
  }
  for (const edge of edges) lines.push(`  ${edge.from} -->|"${label(edge.label)}"| ${edge.to}`);
  for (const [name, color] of Object.entries(colors)) lines.push(`  classDef ${name} fill:${color},stroke:#475569,color:#0f172a,stroke-width:1px`);
  if (!nodes.length) lines.push('  empty["No matching resources in this snapshot"]');
  return { provider: snapshot.provider, snapshotHash: snapshot.contentHash, kind, nodes, edges, mermaid: lines.join('\n'),
    totalNodes: selected.length, omittedNodes: selected.length - nodes.length, omittedEdges, truncated: selected.length > nodes.length,
    limitations: ['Edges represent explicit provider-normalized references, not runtime traffic or effective permissions.', ...(selected.length > nodes.length ? [`View limited to ${maxNodes} nodes; narrow the snapshot for a complete diagram.`] : [])] };
}
