import test from 'node:test';
import * as api from '../diagnostics/index.js';
import { packageCases } from './package-contract.mjs';

for (const execution of ['buffered', 'direct']) for (const item of packageCases)
  test(`public package contract: ${item.name}, ${execution}`, () => item.run(api, execution));
