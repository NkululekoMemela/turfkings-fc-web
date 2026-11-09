import {Capacitor, CapacitorHttp} from "@capacitor/core";

// Raster PDF pages use standard JPEG image streams, keeping names and kit numbers identical to PNG.
export function jpegPagesToPdf(pages){
 const chunks=[],offsets=[0];let size=0;const enc=new TextEncoder();const put=v=>{const b=typeof v==='string'?enc.encode(v):v;chunks.push(b);size+=b.length;};
 const object=(id,body)=>{offsets[id]=size;put(`${id} 0 obj\n`);body();put('\nendobj\n');};
 put('%PDF-1.4\n');object(1,()=>put('<< /Type /Catalog /Pages 2 0 R >>'));
 object(2,()=>put(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`));
 pages.forEach((page,i)=>{const p=3+i*3,image=p+1,content=p+2;object(p,()=>put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`));object(image,()=>{put(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);put(page.bytes);put('\nendstream');});const scale=Math.min(563/page.width,810/page.height),w=page.width*scale,h=page.height*scale;const commands=`q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${((595-w)/2).toFixed(3)} ${(826-h).toFixed(3)} cm /Im0 Do Q`;object(content,()=>put(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`));});
 const xref=size;put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)put(String(offsets[i]).padStart(10,'0')+' 00000 n \n');put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(chunks,{type:'application/pdf'});
}
// A WebView can display a remote image even when JS fetch is blocked by CORS.
export async function embedTeamsheetLogo(url) {
 if(/^data:image\//i.test(url))return url;
 const abort = new AbortController();
 const timeout = setTimeout(() => abort.abort(), 4000);
 try {
  const response = await fetch(url, {signal:abort.signal, credentials:"omit"});
  if(!response.ok)throw Error("Logo unavailable");
  const blob = await response.blob();
  if(!blob.type.startsWith("image/") || !blob.size)throw Error("Invalid logo");
  return await new Promise((resolve,reject)=>{
   const reader = new FileReader();
   reader.onload = () => resolve(reader.result);
   reader.onerror = reject;
   reader.readAsDataURL(blob);
  });
 } catch(error) {
  if(!Capacitor.isNativePlatform() || !url.startsWith("https://"))throw error;
  const result = await CapacitorHttp.get({
   url, responseType:"arraybuffer", connectTimeout:4000, readTimeout:4000,
  });
  const mime = Object.entries(result.headers || {}).find(([name]) => name.toLowerCase()==="content-type")?.[1]
   ?.split(";")[0].trim().toLowerCase();
  if(result.status < 200 || result.status >= 300 || !/^image\/[a-z0-9.+-]+$/.test(mime || "") ||
     typeof result.data !== "string" || !/^[a-z0-9+/=\s]+$/i.test(result.data))throw Error("Logo unavailable");
  return `data:${mime};base64,${result.data.replace(/\s/g, "")}`;
 } finally {
  clearTimeout(timeout);
 }
}

// Clone the actual rendered card. Only column count and page grouping change.
export async function captureTeamsheetCard(source,{start=0,count=Infinity,logoCache=new Map()}={}){
 if(!source)throw Error('The teamsheet is not ready.');
 const shell=document.createElement('div');shell.className='app-root app-root--field';shell.style.cssText='position:fixed;left:-20000px;top:0;width:760px;min-height:0;display:block;padding:0;pointer-events:none;z-index:-1;';
 const originalRoot=source.closest('.app-root');if(originalRoot){shell.className=originalRoot.className;for(const attribute of originalRoot.attributes)if(attribute.name.startsWith('data-'))shell.setAttribute(attribute.name,attribute.value);}
 const context=document.createElement('div');context.className='field-ribbon-frame';
 const page=document.createElement('div');page.className='page squads-page field-matchday-squads-page';page.style.cssText='width:760px;max-width:none;padding:0;margin:0;';
 const card=source.cloneNode(true);card.removeAttribute('id');card.style.setProperty('width','760px','important');card.style.setProperty('max-width','none','important');
 const css=getComputedStyle(source);for(let i=0;i<css.length;i++){const key=css[i];if(key.startsWith('--'))card.style.setProperty(key,css.getPropertyValue(key));}card.style.fontFamily=css.fontFamily;
 const grid=card.querySelector('.teamsheet-card-grid');if(!grid)throw Error('No teamsheet cards were found.');
 const cards=[...grid.children];cards.forEach((node,i)=>{if(i<start||i>=start+count)node.remove();});
 grid.style.setProperty('display','grid','important');grid.style.setProperty('grid-template-columns','repeat(2,minmax(0,1fr))','important');grid.style.setProperty('align-items','stretch','important');
 page.appendChild(card);context.appendChild(page);shell.appendChild(context);document.body.appendChild(shell);
 try{
  // Remote logos and unavailable web fonts must never reject an otherwise valid teamsheet.
  const placeholder='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><text x="24" y="35" font-size="34" text-anchor="middle">⚽</text></svg>');
  await Promise.all([...card.querySelectorAll('img')].map(async img=>{
   const url=img.src;
   if(!logoCache.has(url))logoCache.set(url,embedTeamsheetLogo(url).catch(()=>placeholder));
   img.removeAttribute('srcset');
   img.removeAttribute('sizes');
   img.src=await logoCache.get(url);
   img.style.removeProperty('display');
  }));
  await Promise.all([...card.querySelectorAll('img')].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;setTimeout(resolve,2500);})));
  const {toCanvas}=await import('html-to-image');
  const canvas=await toCanvas(card,{pixelRatio:1.5,cacheBust:false,skipFonts:true,imagePlaceholder:placeholder,backgroundColor:css.backgroundColor==='rgba(0, 0, 0, 0)'?'#10222b':css.backgroundColor,filter:node=>!node.classList?.contains('field-teamsheet-export-options')});
  return canvas;
 }finally{shell.remove();}
}
export async function downloadFieldTeamsheet({element,dayId,format}){
 const total=element?.querySelectorAll('.teamsheet-card-team').length||0;if(!total)throw Error('No teamsheet is available yet.');
 const {saveFieldExport}=await import('./saveFieldExport.js');const filename=`field-teamsheet-${String(dayId||'upcoming').replace(/[^a-z0-9_-]/gi,'-')}`;
 if(format==='pdf'){
  const pages=[],logoCache=new Map();for(let start=0;start<total;start+=4){const canvas=await captureTeamsheetCard(element,{start,count:4,logoCache});const data=canvas.toDataURL('image/jpeg',.94).split(',')[1];pages.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(atob(data),v=>v.charCodeAt(0))});}
  return saveFieldExport(jpegPagesToPdf(pages),filename+'.pdf');
 }
 if(total>20)throw Error('Choose PDF for more than 20 Clubs.');
 const canvas=await captureTeamsheetCard(element);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not prepare the image.');return saveFieldExport(blob,filename+'.png');
}
