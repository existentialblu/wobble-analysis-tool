import {parentPort} from 'node:worker_threads';
globalThis.onmessage=null;globalThis.postMessage=data=>parentPort.postMessage(data);
await import('../../../public/return-set/worker.js');
parentPort.on('message',data=>globalThis.onmessage({data}));
