import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const css=readFileSync('src/index.css','utf8');
describe('portrait responsive table regression',()=>{
 it('cancels desktop min-width before stacking rows',()=>{
  expect(css).toMatch(/table\[data-mh-responsive\]\s*\{[^}]*display: block;[^}]*width: 100%;[^}]*min-width: 0 !important/);
 });
 it('does not allocate an empty label column when cells have no data-label (user management)',()=>{
  expect(css).not.toMatch(/tbody td::before\s*\{/);
  expect(css).toContain('td[data-label]:not([data-label=""])::before');
 });
 it('wraps cell text and constrains children instead of pushing actions offscreen',()=>{
  expect(css).toContain('white-space: normal');
  expect(css).toContain('td > * { min-width: 0; max-width: 100%; }');
 });
 it('keeps totals visible on portrait',()=>{
  expect(css).not.toMatch(/tfoot\s*\{\s*display:\s*none/);
 });
});
