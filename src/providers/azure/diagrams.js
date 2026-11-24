import { normalize } from './model.js';
import { diagram as render } from '../../core/diagrams/index.js';
export function diagram(input, kind = 'architecture', options = {}) { return render(normalize(input), kind, options); }
