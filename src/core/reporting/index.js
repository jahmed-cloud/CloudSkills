import { readFileSync } from 'node:fs';
import { z } from 'zod';

const css = readFileSync(new URL('./report.css', import.meta.url), 'utf8');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const reportSchema = z.object({
  schemaVersion: z.literal('1.0'), provider: z.string().optional(), category: z.string(), source: z.string(), collectedAt: z.string().nullable(),
  snapshotHash: z.string(), resourceCount: z.number().int().nonnegative(),
  summary: z.object({ pass: z.number(), fail: z.number(), unknown: z.number(), evaluated: z.number(), total: z.number(), observedPassPercentage: z.number().nullable() }),
  findings: z.array(z.object({ id: z.string(), control: z.string(), resourceId: z.string(), resourceName: z.string(), category: z.string(), severity: z.string(), status: z.enum(['pass', 'fail', 'unknown']), title: z.string(), evidence: z.object({ path: z.string(), expected: z.unknown(), actual: z.unknown() }), recommendation: z.string(), source: z.string() })),
  limitations: z.array(z.string()),
});

/** @param {import('../interfaces/index.ts').ICloudReport} input */
function validated(input) {
  const report = reportSchema.parse(input);
  const counts = { pass: 0, fail: 0, unknown: 0 };
  for (const f of report.findings) counts[f.status]++;
  const evaluated = counts.pass + counts.fail;
  return { ...report, summary: { ...counts, total: report.findings.length, evaluated, observedPassPercentage: evaluated ? Math.round(100 * counts.pass / evaluated) : null } };
}
/** @param {import('../interfaces/index.ts').ICloudReport} input */
export function jsonReport(input) { return JSON.stringify(validated(input), null, 2); }
const value = input => escape(input === undefined || input === null ? 'Not observed' : typeof input === 'string' ? input : JSON.stringify(input));
const sourceLink = source => {
  try { const url = new URL(source); if (url.protocol === 'https:' || url.protocol === 'http:') return `<a href="${escape(url.href)}" rel="noreferrer noopener">Control reference ↗</a>`; } catch {}
  return escape(source);
};
function findingCard(f, index) {
  return `<article class="finding" id="finding-${index}"><div class="finding-heading"><span class="badge ${f.status}">${escape(f.status)}</span><span class="severity">${escape(f.severity)} severity</span><code>${escape(f.control)}</code></div>
<h3>${escape(f.title)}</h3><p class="resource">${escape(f.resourceName)}</p><details class="resource-id"><summary>Resource identifier</summary><code>${escape(f.resourceId)}</code></details>
<div class="evidence"><div><span>Property</span><code>${escape(f.evidence.path)}</code></div><div><span>Expected</span><code>${value(f.evidence.expected)}</code></div><div><span>Observed</span><code>${value(f.evidence.actual)}</code></div></div>
<div class="recommendation"><strong>Recommended action</strong><p>${escape(f.recommendation)}</p></div><footer>${sourceLink(f.source)}</footer></article>`;
}
/** Standalone, script-free HTML. No SDK types, network assets or provider-specific rules. */
/** @param {import('../interfaces/index.ts').ICloudReport} input */
export function htmlReport(input) {
  const report = validated(input); const s = report.summary;
  const priorities = { critical: 0, high: 1, medium: 2, low: 3 };
  const sections = [['fail', 'Findings to address', 'Observed settings that differ from the selected controls.'], ['unknown', 'Evidence to collect', 'These checks need more information before a conclusion can be reached.'], ['pass', 'Passing checks', 'Observed settings that meet the selected controls.']];
  const groups = sections.map(([status, title, description]) => {
    const items = report.findings.filter(f => f.status === status).sort((a, b) => (priorities[a.severity] ?? 4) - (priorities[b.severity] ?? 4) || a.resourceName.localeCompare(b.resourceName));
    return `<section id="${status}" aria-labelledby="${status}-heading"><div class="section-heading"><div><p class="eyebrow">${escape(status)} · ${items.length} checks</p><h2 id="${status}-heading">${title}</h2><p>${description}</p></div></div>${items.length ? `<details class="findings-group" ${status === 'pass' ? '' : 'open'}><summary>View ${items.length} ${status === 'pass' ? 'passing checks' : 'findings'}</summary><div class="findings-grid">${items.map((f, i) => findingCard(f, `${status}-${i}`)).join('')}</div></details>` : '<p class="empty">No checks in this category.</p>'}</section>`;
  }).join('');
  const rate = s.observedPassPercentage === null ? 'N/A' : `${s.observedPassPercentage}%`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>CloudSkills — Architecture Review</title><style>${css}</style></head><body>
<a class="skip-link" href="#main">Skip to report</a><div class="layout"><aside class="sidebar"><a class="brand" href="#overview"><span class="brand-mark">C</span>CloudSkills</a><p class="sidebar-caption">Architecture intelligence</p><nav aria-label="Report sections"><a href="#overview">01 <span>Overview</span></a><a href="#fail">02 <span>Findings <b>${s.fail}</b></span></a><a href="#unknown">03 <span>Evidence gaps <b>${s.unknown}</b></span></a><a href="#pass">04 <span>Passing checks <b>${s.pass}</b></span></a><a href="#coverage">05 <span>Scope &amp; provenance</span></a></nav><div class="sidebar-note">Read-only assessment<br>Evidence-based conclusions</div></aside>
<main id="main"><header id="overview"><div class="topline"><span class="eyebrow">CLOUD ENVIRONMENT REVIEW</span><span class="provider">${escape(report.provider || 'Provider unspecified')}</span></div><h1>Architecture review</h1><p class="lede">Configuration findings, clear evidence, and practical next steps.</p><div class="metadata"><span>Scope <strong>${escape(report.category)}</strong></span><span>Source <strong>${escape(report.source)}</strong></span><span>Collected <strong>${escape(report.collectedAt || 'Not supplied')}</strong></span></div></header>
<section class="metrics" aria-label="Assessment summary">${[['Resources reviewed', report.resourceCount, 'neutral'], ['Observed failures', s.fail, 'fail'], ['Unknown checks', s.unknown, 'unknown'], ['Evaluated pass rate', rate, 'pass']].map(([title, count, status]) => `<div class="metric ${status}"><span>${title}</span><strong>${escape(count)}</strong></div>`).join('')}</section>
<div class="coverage-strip"><strong>${s.evaluated} of ${s.total} checks evaluated</strong><span>${s.pass} passed · ${s.unknown} unknown</span><progress value="${s.evaluated}" max="${Math.max(1, s.total)}" aria-label="Checks with observed evidence"></progress></div><p class="method-note">The pass rate covers evaluated checks only. It is not an overall security or compliance score.${s.total === 0 ? ' No applicable checks were found; this does not establish compliance.' : ''}</p>
${groups}<section id="coverage"><p class="eyebrow">ASSESSMENT BOUNDARIES</p><h2>Scope &amp; provenance</h2><ul class="limitations">${report.limitations.map(v => `<li>${escape(v)}</li>`).join('')}</ul><div class="provenance"><span>Snapshot SHA-256</span><code>${escape(report.snapshotHash)}</code><span>Schema ${escape(report.schemaVersion)}</span></div></section><footer class="page-footer">CloudSkills · Read-only cloud architecture evidence</footer></main></div></body></html>`;
}
