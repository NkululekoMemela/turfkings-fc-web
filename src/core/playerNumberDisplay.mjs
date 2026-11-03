export function splitNumberDisplay(value){const text=String(value||''),match=/^\((\d+|-)\)\s+([\s\S]+)$/.exec(text);return match?{name:match[2],number:`(${match[1]})`}:{name:text,number:''};}
