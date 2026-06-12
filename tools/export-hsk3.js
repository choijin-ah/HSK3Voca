// hsk3.js 데이터를 한눈에 보기 좋은 형태로 내보내는 스크립트.
// 출력물: tools/out/hsk3-vocab.csv (엑셀용, UTF-8 BOM), tools/out/hsk3-vocab.html (인쇄용)
// 실행:  node tools/export-hsk3.js
'use strict';

const fs = require('fs');
const path = require('path');

// hsk3.js는 window.VOCAB_SETS에 데이터를 넣는다. window 셰임을 만들어 그대로 실행.
const root = path.resolve(__dirname, '..');
const win = { VOCAB_SETS: {} };
global.window = win;
require(path.join(root, 'data', 'hsk3.js'));

const set = win.VOCAB_SETS.hsk3;
const cats = set.categories || [];
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

// ── CSV (엑셀) ───────────────────────────────────────────────
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const L = set.labels || { front: '중국어', reading: '병음', meaning: '뜻' };
const rows = [['번호', '분류', '우선순위', L.front, L.reading, L.meaning, '품사']];
cats.forEach(function (c) {
  (c.words || []).forEach(function (w) {
    rows.push([w.number, c.title, c.priority || '', w.front, w.reading, w.meaning, w.partOfSpeech || '']);
  });
});
const csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
fs.writeFileSync(path.join(outDir, 'hsk3-vocab.csv'), csv);

// ── HTML (인쇄/PDF) ─────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}
let totalWords = 0;
const sections = cats.map(function (c) {
  const words = c.words || [];
  totalWords += words.length;
  const trs = words.map(function (w) {
    return '<tr><td class="num">' + esc(w.number) + '</td>' +
      '<td class="front">' + esc(w.front) + '</td>' +
      '<td class="reading">' + esc(w.reading) + '</td>' +
      '<td class="meaning">' + esc(w.meaning) + '</td>' +
      '<td class="pos">' + esc(w.partOfSpeech || '') + '</td></tr>';
  }).join('\n');
  const tip = c.tip ? '<p class="tip"><b>' + esc(c.tip.label || '암기 포인트') + ':</b> ' + esc(c.tip.text) + '</p>' : '';
  return '<section>' +
    '<h2>' + esc(c.title) + ' <span class="badge">' + words.length + '개' +
    (c.priority ? ' · ' + esc(c.priority) : '') + '</span></h2>' +
    (c.description ? '<p class="desc">' + esc(c.description) + '</p>' : '') +
    tip +
    '<table><thead><tr><th class="num">#</th><th>' + esc(L.front) + '</th>' +
    '<th>' + esc(L.reading) + '</th><th>' + esc(L.meaning) + '</th><th>품사</th></tr></thead>' +
    '<tbody>' + trs + '</tbody></table></section>';
}).join('\n');

const html = '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">' +
  '<title>' + esc(set.title) + '</title>\n<style>\n' +
  ':root{--accent:#2563eb;--line:#e5e7eb;--ink:#111827;--muted:#6b7280;}\n' +
  '*{box-sizing:border-box;}\n' +
  'body{font-family:"Malgun Gothic","Microsoft YaHei",system-ui,sans-serif;color:var(--ink);' +
  'max-width:900px;margin:0 auto;padding:32px 24px;line-height:1.5;}\n' +
  'h1{font-size:26px;margin:0 0 4px;}\n' +
  '.lead{color:var(--muted);margin:0 0 24px;}\n' +
  'section{margin:0 0 28px;page-break-inside:avoid;}\n' +
  'h2{font-size:17px;border-bottom:2px solid var(--accent);padding-bottom:6px;margin:24px 0 8px;}\n' +
  '.badge{font-size:12px;font-weight:600;color:var(--accent);}\n' +
  '.desc{color:var(--muted);font-size:13px;margin:4px 0;}\n' +
  '.tip{background:#f1f5ff;border-left:3px solid var(--accent);padding:6px 10px;font-size:13px;margin:6px 0 10px;border-radius:4px;}\n' +
  'table{width:100%;border-collapse:collapse;font-size:14px;}\n' +
  'th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;}\n' +
  'th{background:#f9fafb;font-size:12px;color:var(--muted);font-weight:600;}\n' +
  'thead{display:table-header-group;}\n' +
  'td.num,th.num{width:46px;text-align:right;color:var(--muted);}\n' +
  'td.front{font-size:18px;font-weight:600;width:90px;}\n' +
  'td.reading{color:var(--accent);width:120px;}\n' +
  'td.pos{color:var(--muted);width:60px;}\n' +
  'tbody tr:nth-child(even){background:#fcfcfd;}\n' +
  '@media print{body{padding:0;max-width:none;}a{color:inherit;}}\n' +
  '</style></head><body>\n' +
  '<h1>' + esc(set.title) + '</h1>\n' +
  '<p class="lead">' + esc(set.subtitle || '') + ' · 총 ' + totalWords + '단어 · ' + cats.length + '개 분류</p>\n' +
  sections + '\n</body></html>';

fs.writeFileSync(path.join(outDir, 'hsk3-vocab.html'), html);

console.log('완료: ' + totalWords + '단어, ' + cats.length + '개 분류');
console.log(' - ' + path.join('tools', 'out', 'hsk3-vocab.csv') + '  (엑셀에서 열기)');
console.log(' - ' + path.join('tools', 'out', 'hsk3-vocab.html') + '  (브라우저에서 열고 인쇄/PDF)');
