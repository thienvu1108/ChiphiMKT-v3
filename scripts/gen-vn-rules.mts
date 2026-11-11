// Ghi lại khối GENERATED vn-registry trong firestore.rules từ lib/vnext/featureRegistry.ts
import fs from 'node:fs';
import { rulesBlock } from '../lib/vnext/featureRegistry';
const f = new URL('../firestore.rules', import.meta.url);
const s = fs.readFileSync(f, 'utf8');
const re = /    \/\/ BEGIN GENERATED vn-registry[\s\S]*?\/\/ END GENERATED vn-registry/;
if (!re.test(s)) { console.error('Không thấy khối GENERATED vn-registry trong firestore.rules'); process.exit(1); }
fs.writeFileSync(f, s.replace(re, rulesBlock()));
console.log('firestore.rules: đã cập nhật vnDefaultPerms');
