export async function prepareLogoImage(file) {
 if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Choose a PNG, JPG or WebP image.');
 if(file.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  for(const limit of [1024,768,512]){
   const scale=Math.min(1,limit/Math.max(image.width,image.height));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   const data=canvas.toDataURL('image/png');if(data.length<5*1024*1024)return data;
  }
  throw Error('This image could not be prepared. Choose another logo.');
 }finally{URL.revokeObjectURL(url);}
}

export async function prepareCarouselLogo(dataUrl) {
 const image = new Image();
 image.src = dataUrl;
 await image.decode();
 const scale = Math.min(1, 216 / Math.max(image.width, image.height));
 const canvas = document.createElement("canvas");
 canvas.width = Math.max(1, Math.round(image.width * scale));
 canvas.height = Math.max(1, Math.round(image.height * scale));
 canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
 const thumbnail = canvas.toDataURL("image/webp", .78);
 return /^data:image\/webp;base64,/.test(thumbnail) && thumbnail.length <= 24000 ? thumbnail : "";
}
