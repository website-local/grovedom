import { createFacade } from '../src/facade/document.js';
import { decodeInput } from '../src/wasm/node.js';
import { kernel } from './kernel.js';
import { instrument } from './instrument-kernel.js';
export const measurement = instrument(kernel, { queryDetails: true, allocationDetails: process.env.GROVEDOM_PROFILE_ALLOCATIONS === '1' });
export const { load, contains, merge } = createFacade(measurement.kernel, decodeInput);
