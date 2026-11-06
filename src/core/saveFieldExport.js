import {Capacitor,registerPlugin} from '@capacitor/core';
export async function saveFieldExport(blob,filename){
 if(Capacitor.isNativePlatform()){
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not prepare this file.'));reader.readAsDataURL(blob);});
  if(blob.type==='image/png'&&Capacitor.isPluginAvailable('PoolImages')){try{return await registerPlugin('PoolImages').savePng({base64,filename});}catch{/* Fall back to the document/share path. */}}
  if(!Capacitor.isPluginAvailable('Filesystem'))throw Error('Update the Android app to save teamsheets.');
  const {Filesystem,Directory}=await import('@capacitor/filesystem');
  try{await Filesystem.writeFile({path:'FANM/'+filename,data:base64,directory:Directory.Documents,recursive:true});return {saved:true,location:'Documents/FANM'};}catch{}
  if(!Capacitor.isPluginAvailable('Share'))throw Error('Allow file access, then try saving again.');
  const {Share}=await import('@capacitor/share');
  const file=await Filesystem.writeFile({path:'field-exports/'+filename,data:base64,directory:Directory.Cache,recursive:true});
  try{await Share.share({title:'Matchday teamsheet',files:[file.uri],dialogTitle:'Save or share teamsheet'});}catch(error){if(/cancel|dismiss/i.test(error.message||''))return {cancelled:true};throw error;}
  return {shared:true};
 }
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return {saved:true};
}
