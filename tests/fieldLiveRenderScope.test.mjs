import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Linter} from 'eslint';
import globals from 'globals';
const config={languageOptions:{ecmaVersion:'latest',sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:{...globals.browser,...globals.node}},rules:{'no-undef':'error'}};
for(const path of ['src/pages/VenueLeagueLiveMatchPage.jsx','src/components/VenueLiveMatchRuntime.jsx']){
 test(`${path} has no undefined runtime references`,()=>{
  const messages=new Linter().verify(readFileSync(new URL('../'+path,import.meta.url),'utf8'),config);
  assert.deepEqual(messages.map(({message,line})=>({message,line})),[]);
 });
}
