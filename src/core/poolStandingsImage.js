import {poolStandings} from './poolTable.mjs';
export async function savePoolStandings(night,{share=false}={}){
 const rows=poolStandings(night.pool.players,night.pool.matches.filter(m=>m.verification==='verified'));
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=360+rows.length*80;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#071c17';ctx.fillRect(0,0,canvas.width,canvas.height);
 // Draw the same glossy eight-ball treatment directly onto the canvas.
 ctx.save();
 const ball=ctx.createRadialGradient(67,51,2,85,82,46);
 ball.addColorStop(0,'#626a64');ball.addColorStop(.4,'#101710');ball.addColorStop(1,'#000');
 ctx.shadowColor='#0008';ctx.shadowBlur=12;ctx.shadowOffsetY=5;
 ctx.beginPath();ctx.arc(85,82,44,0,Math.PI*2);ctx.fillStyle=ball;ctx.fill();
 ctx.shadowColor='transparent';ctx.lineWidth=1.5;ctx.strokeStyle='#7b8678';ctx.stroke();
 ctx.beginPath();ctx.arc(85,82,22,0,Math.PI*2);ctx.fillStyle='#fbf9ee';ctx.fill();
 ctx.fillStyle='#080b08';ctx.font='bold 37px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('8',85,84);
 ctx.restore();
 ctx.save();ctx.fillStyle='#bdd7ce';ctx.font='bold 11px sans-serif';
 if('letterSpacing' in ctx)ctx.letterSpacing='1px';
 ctx.textAlign='center';ctx.fillText('THE POOL ROOM',85,148);ctx.restore();
 ctx.fillStyle='#75ebaf';ctx.font='bold 22px sans-serif';ctx.fillText('POOL TABLE FROM FANM',155,62);
 ctx.fillStyle='white';ctx.font='bold 30px sans-serif';ctx.fillText(night.lifecycle==='ended'?'FINAL STANDINGS':'LIVE STANDINGS',155,104);
 if(night.title&&night.title!=='Pool night'){ctx.font='22px sans-serif';ctx.fillText(String(night.title).slice(0,34),155,142);}
 ctx.font='20px sans-serif';ctx.fillStyle='#bdd7ce';ctx.fillText(`Night ${night.code} · ${new Date(night.endedAt||Date.now()).toLocaleDateString()}`,45,200);
 ctx.fillText('PLAYER',95,245);ctx.fillText('W',660,245);ctx.fillText('L',755,245);ctx.fillText('DIFF',840,245);
 rows.forEach((p,i)=>{const y=300+i*80;ctx.fillStyle=i===0?'#f5d87d':'#fff';ctx.font='bold 26px sans-serif';ctx.fillText(`${i+1}`,45,y);ctx.fillText(p.name.slice(0,28),95,y);ctx.fillText(String(p.wins),660,y);ctx.fillText(String(p.losses),755,y);ctx.fillText(String(p.difference),840,y);});
 const pending=night.pool.matches.filter(m=>m.verification!=='verified').length;ctx.fillStyle='#bdd7ce';ctx.font='18px sans-serif';ctx.fillText(pending?`Verified results only · ${pending} scores awaiting admin verification`:'Verified results · Thanks for a great night',45,canvas.height-25);
 const {Capacitor,registerPlugin}=await import('@capacitor/core');const filename=`FANM-pool-${night.code}-standings.png`;
 if(Capacitor.isNativePlatform()){
  if(!Capacitor.isPluginAvailable('PoolImages'))throw Error('Install the latest DEV APK to save or share standings images.');
  const plugin=registerPlugin('PoolImages'),payload={base64:canvas.toDataURL('image/png').split(',')[1],filename};
  return share?plugin.shareImage(payload):plugin.savePng(payload);
 }
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not prepare standings image.');
 if(share){const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Pool Table from FANM'});return {opened:true};}catch(error){if(error.name==='AbortError')return {cancelled:true};throw error;}}throw Error('This browser cannot share images directly. Save the image, then attach it in WhatsApp, or use the updated Android app.');}
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return {saved:true,location:'browser downloads'};
}
