import test from 'node:test';import assert from 'node:assert/strict';
import {renderFieldLogo,stockSpec} from '../functions/fieldLogoDesigns.mjs';
test('starter logos retain their graduated finishes and safely escape editable names',()=>{for(let i=0;i<25;i++){const svg=renderFieldLogo(stockSpec(i),'Cape & Coast <Field>');assert(svg.includes('<linearGradient'));assert(svg.includes('url(#metal)'));assert(!svg.includes('<Field>'));assert(svg.includes('Cape &amp; Coast &lt;Field&gt;'));}});
