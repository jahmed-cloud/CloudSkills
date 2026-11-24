import { normalizeControl } from '../../core/policy/engine.js';

/** Intentionally narrow Azure Policy subset. Unsupported expressions stay unassessed. */
export function importDefinitions(definitions) {
  const controls = []; const unsupported = [];
  for (const definition of definitions) {
    const p = definition.properties || definition;
    const conditions = p.policyRule?.if?.allOf;
    const type = conditions?.find(c => c.field === 'type' && typeof c.equals === 'string');
    const check = conditions?.find(c => c !== type);
    const operators = { notEquals: 'equals', equals: 'notEquals', in: 'notIn', notIn: 'in', exists: 'exists' };
    const op = check && Object.keys(operators).find(k => Object.hasOwn(check, k));
    const effect = p.policyRule?.then?.effect?.toLowerCase();
    // Azure aliases require provider metadata to resolve. Only direct tag/location fields are accepted.
    const tag = /^tags\['([^']+)'\]$/.exec(check?.field || '');
    if (!type || conditions.length !== 2 || !op || !['deny', 'audit'].includes(effect) || (!tag && check.field !== 'location') || /"\[[^\]]*\(/.test(JSON.stringify(check)) || type.equals.includes('[') || (tag && tag[1].includes('.')) || Object.keys(check).length !== 2 || Object.keys(type).length !== 2) {
      unsupported.push({ id: definition.id || definition.name || 'unnamed', reason: 'Requires alias, expression, assignment or effect semantics outside the supported two-condition tag/location subset.' }); continue;
    }
    let expected = check[op];
    if (op === 'exists') {
      if (![true, false, 'true', 'false'].includes(expected)) { unsupported.push({ id: definition.id || definition.name, reason: 'Unsupported exists expression' }); continue; }
      expected = !(expected === true || expected === 'true');
    }
    controls.push(normalizeControl({ id: definition.id || definition.name, title: p.displayName || definition.name, provider: 'azure', resourceType: type.equals, path: tag ? `tags.${tag[1]}` : 'region', operator: operators[op], expected, source: definition.id || 'Azure Policy import' }));
  }
  return { controls, unsupported };
}
