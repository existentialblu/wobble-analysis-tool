import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSignals,analyseWindows,demoChunks} from '../../../public/return-set/engine.js';
import {selectPortraitWindows,prepareNight,compactNight,fitCollection} from '../../../public/return-set/collection.js';
import {nightPage,nearestNight} from '../../../public/return-set/navigation.js';
const golden=JSON.parse(fs.readFileSync(new URL('./fixtures/original-fits.json',import.meta.url))),nights=[];
test('fast preprocessing and window selection preserve the original portraits',()=>{
 for(const mode of ['APAP','ASV']){const chunks=demoChunks(mode),full=buildSignals(chunks),fast=buildSignals(chunks,{portraitOnly:true});for(const k of ['v','leak','bad'])assert.deepEqual(fast[k],full[k]);
  let end=-1;const expected=analyseWindows(full).filter(w=>{if(w.eligible&&w.coverage===1&&w.start>=end){end=w.end;return true}return false}).map(w=>w.start),chosen=selectPortraitWindows(fast);assert.deepEqual(chosen.map(w=>w.start),expected);
  const raw=prepareNight(fast,chosen),compact=compactNight(raw);assert(!('X' in compact));assert(!('y' in compact));assert(JSON.stringify(compact).length<10000);nights.push(compact);const fit=fitCollection([compact]),want=golden[mode];fit.coeff.forEach((c,i)=>assert(Math.abs(c-want.coeff[i])<1e-9));for(const k of ['r2','linearR2','persistenceR2'])assert(Math.abs(fit[k]-want[k])<1e-9);
 }
 const fit=fitCollection(nights);fit.coeff.forEach((c,i)=>assert(Math.abs(c-golden.combined.coeff[i])<1e-9));assert(Math.abs(fit.r2-golden.combined.r2)<1e-9);
});
test('600-night collection uses bounded pages, month filters and direct date navigation',()=>{
 const rows=Array.from({length:600},(_,i)=>{const key=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);return{id:key,key}}).reverse(),collection=[...rows,{id:'combined',key:'combined',combined:true}];
 assert.equal(nightPage(collection).items.length,7);assert.equal(nightPage(collection).pages,86);assert.equal(nightPage(collection,'',85).items.length,5);assert.equal(nightPage(collection,'',9999).page,85);assert.equal(nightPage(collection,'2024-02').total,29);
 const seen=new Set();for(let page=0;page<86;page++)for(const n of nightPage(collection,'',page).items){assert(!seen.has(n.id));seen.add(n.id)}assert.equal(seen.size,600);assert.equal(nearestNight(collection,'2024-01-12').key,'2024-01-12');assert.equal(nearestNight(collection,'2020-01-01').key,'2024-01-01');assert.equal(nearestNight(collection,'bad'),null);
 const pooled=fitCollection(Array.from({length:600},(_,i)=>nights[i%2]));assert.equal(pooled.nightCount,600);pooled.coeff.forEach((c,i)=>assert(Math.abs(c-golden.combined.coeff[i])<1e-7));assert(JSON.stringify(Array.from({length:600},(_,i)=>nights[i%2])).length<6e6);
});
