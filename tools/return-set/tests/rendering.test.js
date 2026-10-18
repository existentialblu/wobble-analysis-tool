import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Portrait} from '../../../public/return-set/portrait.js';

test('renderer coalesces changes, releases WebGL at rest, preserves export, and pauses hidden tabs',async()=>{
 const frames=new Map(),events={},gpuCanvases=[];let frameId=0,draws=0,copies=0,losses=0,exports=0;
 const gl=()=>new Proxy({
  getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,
  drawArrays(){draws++},getExtension:()=>({loseContext(){losses++}})
 },{get:(o,k)=>k in o?o[k]:()=>({})});
 globalThis.document={hidden:false,addEventListener:(n,f)=>events[n]=f,createElement(){
  const canvas={width:300,height:150,getContext:()=>gl(),addEventListener(){}};gpuCanvases.push(canvas);return canvas;
 }};
 globalThis.ResizeObserver=class{observe(){}};globalThis.devicePixelRatio=1;
 globalThis.requestAnimationFrame=f=>{frames.set(++frameId,f);return frameId};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(f=>f(0))};
 const canvas={width:80,height:80,getBoundingClientRect:()=>({width:80,height:80,left:0,top:0}),
  getContext:kind=>{assert.equal(kind,'2d');return{drawImage(){copies++},fillRect(){}}},
  addEventListener(){},toBlob(f,type){exports++;f(new Blob(['retained pixels'],{type}))}};
 const p=new Portrait(canvas);
 try{
  p.setFit({available:true,coeff:[0,0,0,1,0],radius:3});p.resize();p.draw();
  assert.equal(frames.size,1);flush();assert.equal(draws,1);assert.equal(copies,1);
  p.draw();p.resize();assert.equal(frames.size,0);assert.equal(draws,1);
  await new Promise(r=>setTimeout(r,300));
  assert.equal(p.gl,null);assert.equal(p.gpuCanvas,null);assert.equal(p.idleTimer,null);
  assert.equal(losses,1);assert.deepEqual([gpuCanvases[0].width,gpuCanvases[0].height],[1,1]);
  const png=await p.save();assert.equal(png.type,'image/png');assert.equal(exports,1);
  assert.equal(draws,1);assert.equal(copies,1);assert.equal(frames.size,0);
  p.zoom(.8);p.zoom(.8);assert.equal(frames.size,1);flush();
  assert.equal(draws,2);assert.equal(copies,2);assert.equal(gpuCanvases.length,2);
  p.setPalette('tide');document.hidden=true;events.visibilitychange();
  assert.equal(frames.size,0);assert.equal(p.gl,null);assert.equal(losses,2);flush();assert.equal(draws,2);
  p.draw();assert.equal(frames.size,0);
  document.hidden=false;events.visibilitychange();assert.equal(frames.size,1);flush();assert.equal(draws,3);
  document.hidden=true;events.visibilitychange();document.hidden=false;events.visibilitychange();
  assert.equal(frames.size,0);assert.equal(draws,3);assert.equal(copies,3);
 }finally{p.releaseGPU()}
});

test('unavailable WebGL falls back to a bounded CPU image and resumes an interrupted frame',async()=>{
 const frames=new Map(),events={};let id=0,painted=0;
 globalThis.document={hidden:false,addEventListener:(n,f)=>events[n]=f,
  createElement:()=>({getContext:()=>null,addEventListener(){}})};
 globalThis.ResizeObserver=class{observe(){}};globalThis.devicePixelRatio=2;
 globalThis.requestAnimationFrame=f=>{frames.set(++id,f);return id};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(f=>f(0))};
 const canvas={width:600,height:60,getBoundingClientRect:()=>({width:600,height:60,left:0,top:0}),
  addEventListener(){},getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
   putImageData(){painted++}})};
 const p=new Portrait(canvas);p.setFit({available:true,coeff:[0,0,0,1,0],radius:3});flush();
 assert.equal(p.gpuFailed,true);assert.equal(canvas.width,420);assert.equal(canvas.height,42);
 assert.equal(p.drawnKey,null);document.hidden=true;events.visibilitychange();
 await new Promise(r=>setTimeout(r,10));assert.equal(p.rendering,false);
 document.hidden=false;events.visibilitychange();flush();
 while(p.rendering)await new Promise(r=>setTimeout(r,5));
 assert.equal(p.drawnKey,p.viewKey());assert(painted>1);p.draw();assert.equal(frames.size,0);
 assert.equal(p.gl,null);assert.equal(p.idleTimer,null);
});
