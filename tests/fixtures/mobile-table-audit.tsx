import React from 'react';import{createRoot}from'react-dom/client';import{Table,TableBody,TableHeader,TableRow,TableHead,TableCell}from'../../components/ui/table';import'../../src/index.css';
import inventory from './mobile-table-inventory.json';
const screens=['Quản lý Người dùng','Ngân sách Khối','Đối ứng','Dự án','Ban KD','Quản lý Team','NS MKT','Nghiệm thu','Báo cáo tuần','Quản lý Ban','Quản lý Khối','Quản lý Phòng'];
createRoot(document.getElementById('root')!).render(<main style={{padding:24,background:'#f3f5f8'}}>{screens.map(name=><section style={{marginBottom:24}}><h2>{name} · DỮ LIỆU MẪU</h2><div style={{background:'white',padding:24,borderRadius:12}}><div className="rounded-xl border overflow-x-auto"><Table className="min-w-[720px]"><TableHeader><TableRow><TableHead>Người dùng</TableHead><TableHead>Vai trò</TableHead><TableHead>Team</TableHead><TableHead>Thao tác</TableHead></TableRow></TableHeader><TableBody>{['Mẫu A','Mẫu B'].map(n=><TableRow><TableCell><div className="flex flex-col min-w-[140px]"><b>{n}</b><span>demo@example.test</span></div></TableCell><TableCell>Phó Ban KD</TableCell><TableCell>Team mẫu</TableCell><TableCell><button>Duyệt</button></TableCell></TableRow>)}</TableBody></Table></div></div></section>)}</main>);

// Separate signature audit: every table call-site, actual desktop width class,
// mocked data only. This is not a signed-in end-to-end screen test.
if (location.search.includes('inventory')) {
 const root=document.createElement('div'); document.body.append(root);
 createRoot(root).render(<main style={{padding:24}}>{inventory.map((t,i)=>{
 const cls=t.tag.match(/className="([^"]*)"/)?.[1]||'w-full';
 return <section data-audit-signature={i} style={{marginBottom:24}}><h3>{t.file}:{t.line}</h3><div className="overflow-x-auto"><table {...(t.responsive?{'data-mh-responsive':true}:{})} className={cls}><thead><tr><th>Người dùng</th><th>Vai trò</th><th>Thao tác</th></tr></thead><tbody><tr><td><b>Mẫu kiểm tra</b></td><td>Phó Ban KD</td><td><button>Duyệt</button></td></tr></tbody></table></div></section>
 })}</main>);
}
