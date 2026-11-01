import { parentPort, workerData } from 'node:worker_threads';
import { checkPackage } from './package-contract.mjs';

parentPort.postMessage({ phase: 'package import' });
const api = await import(workerData);
parentPort.postMessage(checkPackage(api, {
  onCase(name, execution) { parentPort.postMessage({ phase: 'case', name, execution }); },
}));
