// hsk3.js 데이터를 카드형 HTML로 내보낸다. 중국어/병음/뜻 세로 배치, 암기포인트 제외.
// 출력물: tools/out/hsk3-cards.html
// 실행:  node tools/export-hsk3-cards.js
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const win = { VOCAB_SETS: {} };
global.window = win;
require(path.join(root, 'data', 'hsk3.js'));

const set = win.VOCAB_SETS.hsk3;
const cats = set.categories || [];
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}

let totalWords = 0;
const sections = cats.map(function (c) {
  const words = c.words || [];
  totalWords += words.length;
  const cards = words.map(function (w) {
    return '<div class="card">' +
      '<div class="front">' + esc(w.front) + '</div>' +
      '<div class="reading">' + esc(w.reading) + '</div>' +
      '<div class="meaning">' + esc(w.meaning) +
      (w.partOfSpeech ? ' <span class="pos">' + esc(w.partOfSpeech) + '</span>' : '') +
      '</div></div>';
  }).join('\n');
  return '<section>' +
    '<h2>' + esc(c.title) + ' <span class="badge">' + words.length + '개' +
    (c.priority ? ' · ' + esc(c.priority) : '') + '</span></h2>' +
    '<div class="grid">' + cards + '</div></section>';
}).join('\n');

const html = '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + esc(set.title) + ' 카드</title>\n<style>\n' +
  ':root{--accent:#2563eb;--line:#e5e7eb;--ink:#111827;--muted:#6b7280;}\n' +
  '*{box-sizing:border-box;}\n' +
  'body{font-family:"Malgun Gothic","Microsoft YaHei",system-ui,sans-serif;color:var(--ink);' +
  'max-width:1100px;margin:0 auto;padding:32px 24px;line-height:1.4;background:#f8fafc;}\n' +
  'h1{font-size:26px;margin:0 0 4px;}\n' +
  '.lead{color:var(--muted);margin:0 0 24px;}\n' +
  'section{margin:0 0 28px;}\n' +
  'h2{font-size:17px;border-bottom:2px solid var(--accent);padding-bottom:6px;margin:24px 0 12px;}\n' +
  '.badge{font-size:12px;font-weight:600;color:var(--accent);}\n' +
  '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}\n' +
  '.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 12px;' +
  'text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.04);page-break-inside:avoid;' +
  'display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;min-height:120px;}\n' +
  '.front{font-size:30px;font-weight:700;line-height:1.1;}\n' +
  '.reading{font-size:15px;color:var(--accent);}\n' +
  '.meaning{font-size:14px;color:var(--ink);}\n' +
  '.pos{font-size:12px;color:var(--muted);}\n' +
  '@media print{body{padding:0;max-width:none;background:#fff;}' +
  '.card{box-shadow:none;}}\n' +
  '</style></head><body>\n' +
  '<h1>' + esc(set.title) + '</h1>\n' +
  '<p class="lead">총 ' + totalWords + '단어 · ' + cats.length + '개 분류</p>\n' +
  sections + '\n</body></html>';

fs.writeFileSync(path.join(outDir, 'hsk3-cards.html'), html);
console.log('완료: ' + totalWords + '단어 → ' + path.join('tools', 'out', 'hsk3-cards.html'));
