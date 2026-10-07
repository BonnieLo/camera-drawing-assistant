import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const js=['dist/app.js','dist/sw.js',...readdirSync('dist/lib').filter(f=>f.endsWith('.js')).map(f=>`dist/lib/${f}`)];
for(const file of js){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}
const html=readFileSync('dist/index.html','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML ids');
for(const file of js)for(const m of readFileSync(file,'utf8').matchAll(/\$\('([^']+)'\)/g))if(!ids.includes(m[1]))throw new Error(`Missing UI element in ${file}: ${m[1]}`);
for(const path of ['dist/assets/vase.svg','dist/style.css','dist/project-plan.md','dist/manifest.webmanifest','dist/assets/apple-touch-icon.png'])if(!existsSync(path))throw new Error(`Missing static asset: ${path}`);
console.log(`Syntax and static references OK (${js.length} modules).`);

const manifest=JSON.parse(readFileSync('dist/manifest.webmanifest','utf8'));
for(const icon of manifest.icons)if(!existsSync('dist/'+icon.src))throw new Error('Missing icon');
if(manifest.display!=='standalone'||manifest.start_url!=='./'||manifest.scope!=='./')throw new Error('PWA manifest must be portable across hosts');
