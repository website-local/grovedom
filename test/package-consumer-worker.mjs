import { parentPort, workerData } from 'node:worker_threads';
import { checkPackage } from './package-contract.mjs';

const api = await import(workerData);
parentPort.postMessage(checkPackage(api));
