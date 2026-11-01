import test from 'node:test';
import * as api from '../diagnostics/index.js';
import { selectionModeCases } from './selection-mode-contract.mjs';

for (const execution of ['buffered', 'direct']) for (const item of selectionModeCases)
  test(`${item.name}, ${execution}`, () => item.run(api, execution));
