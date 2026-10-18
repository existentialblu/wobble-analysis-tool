import {test} from 'node:test';
import assert from 'node:assert/strict';
function nightFile(day,phase=0){const ns=1,records=24,duration=60,samples=60,head=512,bytes=new Uint8Array(head+records*samples*2);bytes.fill(32,0,head);const put=(at,len,value)=>bytes.set(new TextEncoder().encode(String(value).padEnd(len).slice(0,len)),at);put(0,8,0);put(168,8,day+'.10.26');put(176,8,'22.00.00');put(184,8,head);put(192,44,'EDF+C');put(236,8,records);put(244,8,duration);put(252,4,ns);const fields=[['MinVent.2s',16],['',80],['L/min',8],[0,8],[30,8],[-32768,8],[32767,8],['',80],[samples,8],['',32]];let at=256;for(const [value,length]of fields){put(at,length,value);at+=length}const view=new DataView(bytes.buffer);for(let t=0;t<records*samples;t++){const value=10+2*Math.sin(t*2*Math.PI/42+phase)+.4*Math.sin(t/11);view.setInt16(head+t*2,Math.round(-32768+value/30*65535),true)}return new File([bytes],'202610'+day+'_220000_PLD.edf')}
test('real worker import path picks signal files, groups nights, pools them and replaces dates',async()=>{
 globalThis.onmessage=null;const messages=[];globalThis.postMessage=m=>messages.push(m);await import('../../../public/return-set/worker.js');
 const send=async(type,files=[])=>{messages.length=0;await globalThis.onmessage({data:{type,id:1,files}});const error=messages.find(m=>m.type==='error');assert(!error,error?.message);return messages.findLast(m=>m.type==='gallery')};
 let m=await send('load',[nightFile('16'),new File(['ignored event file'],'20261016_220000_EVE.edf')]);
 assert.equal(m.portraits.length,1);assert(m.portraits[0].fit.available);assert.equal(m.portraits[0].key,'2026-10-16');assert(!m.portraits[0].synthetic);
 m=await send('load',[nightFile('17',.2)]);assert.equal(m.portraits.length,3);assert.equal(m.portraits[2].id,'combined');assert.equal(m.portraits[2].fit.nightCount,2);
 m=await send('load',[nightFile('16',.5)]);assert.equal(m.portraits.length,3);assert.equal(m.portraits[2].fit.nightCount,2);
 m=await send('clear');assert.equal(m.portraits.length,0);
});
