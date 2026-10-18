import {expandFiles,inspectEDF,decodeEDF,nightKey} from './io.js';
import {buildSignals,demoChunks} from './engine.js';
import {prepareNight,fitCollection,compactNight,selectPortraitWindows} from './collection.js';
const nights=new Map();let examples=false,generation=0;
const send=(type,id,data={})=>postMessage({type,id,...data});
function finish(id,errors=[],cancelled=false){const list=[...nights.values()].map(({data,...portrait})=>portrait).sort((a,b)=>b.key.localeCompare(a.key));if(list.length>1)list.push({id:'combined',key:'combined',label:'All nights',combined:true,synthetic:examples,fit:fitCollection([...nights.values()].map(n=>n.data))});send('gallery',id,{portraits:list,errors,synthetic:examples,cancelled})}
function modelNight(key,label,chunks,synthetic=false){const signals=buildSignals(chunks,{portraitOnly:true}),windows=selectPortraitWindows(signals),data=compactNight(prepareNight(signals,windows)),fit=data.available?fitCollection([data]):data;return{id:key,key,label,fit,data,synthetic,source:signals.sourceLabel}}
onmessage=async event=>{const {type,id}=event.data;if(type==='cancel'){generation++;return}const current=++generation,check=()=>{if(current!==generation)throw Error('Import stopped.')};const errors=[];try{
 if(type==='examples'){nights.clear();examples=true;for(const mode of ['APAP','ASV']){send('progress',id,{message:'Making example portraits…'});const key='example-'+mode;nights.set(key,modelNight(key,'Example · '+mode,demoChunks(mode),true))}finish(id)}
 else if(type==='load'){
  send('progress',id,{message:'Finding BRP / PLD files…'});
  const expanded=await expandFiles(event.data.files,message=>{check();send('progress',id,{message})});check();
  const preferred=expanded.filter(f=>/_(BRP|BPR|PLD)\.edf(?:\.gz)?$/i.test(f.name)),files=(preferred.length?preferred:expanded).filter(f=>/\.edf$/i.test(f.name));
  if(!files.length)throw Error('ResMed only: choose the night folder containing BRP and PLD EDF files.');
  const groups=new Map();let headers=0;
  for(const file of files){check();try{const meta=await inspectEDF(file);if(!meta.signals.some(s=>['flow','mv','leak','mask','pressure','epap'].includes(s.kind)))continue;const key=nightKey(meta.start);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({file,meta})}catch(err){errors.push(file.name+': '+err.message)}if(++headers%100===0)send('progress',id,{message:'Finding nights · '+headers+' / '+files.length+' files…'})}
  check();if(!groups.size)throw Error('No usable breathing signals were found in those EDF files.');
  if(examples){nights.clear();examples=false}let done=0;const started=performance.now();
  for(const [key,entries]of [...groups].sort((a,b)=>b[0].localeCompare(a[0]))){check();const remaining=done>=3?Math.ceil((performance.now()-started)/done*(groups.size-done)/1000):null;send('progress',id,{message:'Making '+key+' · '+(done+1)+' / '+groups.size+(remaining===null?'':' · ~'+remaining+' s left')+'…'});try{const chunks=[];for(const {file,meta}of entries){check();const buffer=await file.arrayBuffer();check();chunks.push(...decodeEDF(buffer,meta).chunks)}nights.set(key,modelNight(key,key,chunks));}catch(err){check();errors.push(key+': '+err.message)}done++;
   // Let the worker receive Stop between nights, including in-memory ZIP entries.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();finish(id,errors);
 }else if(type==='clear'){nights.clear();examples=false;finish(id)}
}catch(err){if(current!==generation)finish(id,errors,true);else send('error',id,{message:err.message||String(err)})}};
