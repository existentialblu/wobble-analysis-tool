import {test} from 'node:test';
import assert from 'node:assert/strict';
import {portraitFrame,Portrait,previewPixels,PALETTES} from '../../../public/return-set/portrait.js';
globalThis.document={hidden:false,addEventListener(){}};
globalThis.requestAnimationFrame=()=>1;
const circle=radius=>({available:true,coeff:[0,0,0,1/radius**2,0],radius:3});
test('auto framing gives analytically known circles consistent margins across very different scales',()=>{
 for(const radius of [.01,.1,1,10]){const fit=circle(radius),before=JSON.stringify(fit);for(const [w,h]of [[800,800],[120,84],[400,900],[1200,500]]){const frame=portraitFrame(fit,w,h),visibleDiameter=frame.span*Math.max(w,h)/Math.min(w,h),occupancy=2*radius/(frame.span);assert(frame.estimated);assert(Math.abs(frame.center[0])<1e-10);assert(Math.abs(frame.center[1])<1e-10);assert(occupancy>.78&&occupancy<.84);assert(visibleDiameter>2*radius)}assert.equal(JSON.stringify(fit),before)}
 assert.equal(portraitFrame({available:false},100,100).span,3.6);
});
test('reset and initial resizing fit the view; palette changes and resizing preserve an explored camera',()=>{
 globalThis.ResizeObserver=class{observe(){}};globalThis.devicePixelRatio=1;let size={width:800,height:800};const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0},{get:(o,k)=>k in o?o[k]:()=>({})});const canvas={width:800,height:800,getBoundingClientRect:()=>({...size,left:0,top:0}),getContext:()=>gl,addEventListener(){}};
 const p=new Portrait(canvas),fit=circle(1);p.setFit(fit);const initial=p.span;p.zoom(.5);p.center[0]=.2;p.setPalette('tide');assert.equal(p.span,initial*.5);assert.equal(p.center[0],.2);size={width:1200,height:500};p.resize();assert.equal(p.span,initial*.5);assert.equal(p.center[0],.2);p.reset();assert.deepEqual(p.center,portraitFrame(fit,1200,500).center);assert.equal(p.span,portraitFrame(fit,1200,500).span);p.setFit(circle(10));assert(p.span>initial*3);
});
test('thumbnail framing leaves a clear border around the rendered circle',()=>{
 const pixels=previewPixels(circle(1),120,84);for(let x=0;x<120;x++){const top=x*4,bottom=((84-1)*120+x)*4;assert(pixels[top]<30);assert(pixels[bottom]<30)}for(let y=0;y<84;y++){assert(pixels[y*120*4]<30);assert(pixels[(y*120+119)*4]<30)}
});

test('palettes colour bounded interiors in previews and the full CPU renderer',async()=>{
 const fit=circle(1),w=24,h=24,frame=portraitFrame(fit,w,h),at=((h/2)*w+w/2)*4,centres={};
 for(const key of Object.keys(PALETTES)){const preview=previewPixels(fit,w,h,key);centres[key]=Array.from(preview.slice(at,at+3));let output;const renderer={canvas:{width:w,height:h},ctx:{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:d=>output=d.data},fit,span:frame.span,center:frame.center,mode:1,palette:key,job:0};Portrait.prototype.cpuDraw.call(renderer);while(renderer.rendering)await new Promise(r=>setTimeout(r,1));assert.deepEqual(Array.from(output.slice(at,at+3)),centres[key]);}
 assert(centres.tide[1]>centres.tide[0]*2);assert(centres.ember[0]>centres.ember[2]*3);assert(centres.ice[2]>centres.ice[0]*1.5);assert.notDeepEqual(centres.dusk,centres.ember);
});
