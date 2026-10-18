import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSignals,analyseWindows,demoChunks} from '../../../public/return-set/engine.js';
import {prepareNight,fitCollection} from '../../../public/return-set/collection.js';
import {previewPixels,PALETTES} from '../../../public/return-set/portrait.js';
import fs from 'node:fs';
const nights=['APAP','ASV'].map(mode=>{const signals=buildSignals(demoChunks(mode));return prepareNight(signals,analyseWindows(signals))});
test('whole-night model retains complete nonoverlapping sections at a shared five-second step',()=>{
 for(const n of nights){assert(n.available);assert(n.windowCount>4);assert.equal(n.step,5);assert.equal(n.X.length,n.windowCount*94);assert(n.sigma>0);assert(n.y.every(Number.isFinite))}
 const s={v:Float32Array.from({length:1440},(_,i)=>10+Math.sin(i/8)),sourceLabel:'test'};
 const clean=(start,end)=>({start,end,eligible:true,coverage:1});
 const p=prepareNight(s,[clean(0,480),clean(30,510),clean(480,960),{...clean(960,1440),coverage:.999}]);
 assert.equal(p.windowCount,2);assert.equal(p.X.length,188);
 assert.equal(prepareNight({v:new Float32Array(480).fill(10)},[clean(0,480)]).available,false);
});
test('pooled map gives each night equal weight independently of its sample count',()=>{
 const doubled={...nights[0],X:nights[0].X.flatMap(r=>[r,r]),y:nights[0].y.flatMap(v=>[v,v]),split:nights[0].split*2};
 const fit=fitCollection(nights),repeated=fitCollection([doubled,nights[1]]);
 assert(fit.available);assert.equal(fit.nightCount,2);
 fit.coeff.forEach((c,i)=>assert(Math.abs(c-repeated.coeff[i])<1e-9));
 const a=fitCollection([nights[0]]),b=fitCollection([nights[1]]);
 assert(fit.coeff.some((c,i)=>Math.abs(c-(a.coeff[i]+b.coeff[i])/2)>1e-5));
 for(const f of [a,b,fit]){assert(f.coeff.every(Number.isFinite));assert(Number.isFinite(f.r2));const pixels=previewPixels(f);assert.equal(pixels.length,120*84*4);let min=255,max=0;for(let i=0;i<pixels.length;i+=4){min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);assert.equal(pixels[i+3],255)}assert(max-min>40)}
 const fixture={APAP:{fit:a},ASV:{fit:b},combined:{fit}};
 if(process.env.FRACTAL_FIXTURE)fs.writeFileSync(process.env.FRACTAL_FIXTURE,JSON.stringify(fixture));
});

test('colour palettes recolour the same geometry without changing the fit',()=>{const fit=fitCollection(nights),before=JSON.stringify(fit),views=Object.keys(PALETTES).map(key=>previewPixels(fit,120,84,key));for(const p of views.slice(1))assert(p.some((v,i)=>v!==views[0][i]));for(let i=3;i<views[0].length;i+=4)assert(views.every(p=>p[i]===255));assert.equal(JSON.stringify(fit),before)});
