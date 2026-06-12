// hsk3.js 단어를 "비슷한 뜻끼리" 의미 그룹으로 묶어 카드형 HTML로 내보낸다. 품사 제외.
// 그룹 정의는 단어 번호(number)로 하고, 단어 텍스트(중국어/병음/뜻)는 원본 hsk3.js에서 가져온다.
// 출력물: tools/out/hsk3-by-meaning.html
// 실행:  node tools/export-hsk3-meaning.js
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const win = { VOCAB_SETS: {} };
global.window = win;
require(path.join(root, 'data', 'hsk3.js'));

const set = win.VOCAB_SETS.hsk3;
const byNum = {};
set.categories.forEach(function (c) {
  (c.words || []).forEach(function (w) { byNum[w.number] = w; });
});

// ── 의미 그룹 정의 (제목 + 단어 번호들) ─────────────────────
const GROUPS = [
  { title: '인칭·지시 대명사', nums: [112, 113, 73, 226, 106, 105, 249, 596, 166, 320] },
  { title: '의문사 (무엇·누구·어떻게)', nums: [142, 69, 70, 94, 93, 140, 141, 257, 364] },
  { title: '수량 표현 (몇·조금)', nums: [24, 43, 124] },
  { title: '숫자', nums: [57, 131, 25, 88, 103, 114, 58, 79, 2, 47, 95, 153, 233, 525, 216, 309, 173] },
  { title: '양사·단위', nums: [31, 6, 51, 196, 289, 516, 503, 442, 449, 530, 587, 331, 362, 163, 184, 462, 284, 415, 104] },
  { title: '하루 시간대', nums: [288, 91, 144, 121, 256, 118] },
  { title: '날짜·달력', nums: [46, 67, 150, 237, 74, 137, 87, 190, 127, 591, 241, 424] },
  { title: '시간 단위·기간', nums: [29, 263, 243, 97, 428] },
  { title: '시간·빈도 부사', nums: [377, 390, 567, 561, 598, 276, 535, 489, 590, 461, 562, 432, 429, 597, 570, 294, 523] },
  { title: '가족', nums: [3, 62, 181, 200, 172, 223, 26, 75, 556, 467, 507, 305, 236, 290, 189, 421] },
  { title: '사람·호칭·직업', nums: [85, 225, 228, 76, 68, 266, 53, 128, 110, 117, 120, 133, 509, 431, 541, 178, 519, 440, 453] },
  { title: '신체', nums: [242, 271, 326, 366, 448, 521, 416, 522] },
  { title: '건강·병원', nums: [240, 371, 379, 514, 273, 134, 409, 412, 505, 475, 501, 551, 504, 260] },
  { title: '음식·맛', nums: [9, 66, 463, 464, 344, 199, 270, 283, 78, 264, 537, 479, 100, 512, 10, 206, 227, 99, 391, 478, 11, 37, 16, 314, 365, 437, 515, 191, 548] },
  { title: '식당·식기', nums: [27, 328, 5, 526, 476, 444] },
  { title: '색깔', nums: [152, 192, 193, 402, 446, 457, 272] },
  { title: '방향·위치', nums: [89, 115, 300, 281, 81, 39, 56, 253, 229, 588, 358, 468, 533, 316, 374] },
  { title: '장소·건물·지명', nums: [44, 176, 224, 338, 550, 130, 197, 312, 185, 90, 333, 322, 565, 383, 404, 524, 353, 456, 335, 389, 500, 355, 420, 217, 42, 198, 4, 143, 357, 403] },
  { title: '교통·이동·여행', nums: [28, 161, 12, 183, 297, 356, 232, 407, 545, 52, 83, 40, 298, 169, 202, 160, 308, 452, 430, 218, 481, 347] },
  { title: '날씨·하늘', nums: [108, 235, 277, 122, 384, 269, 579, 511, 578, 55, 84] },
  { title: '계절', nums: [340, 534, 487, 359] },
  { title: '자연·식물', nums: [395, 330, 502, 397] },
  { title: '동물', nums: [360, 33, 63, 458, 473, 549] },
  { title: '옷·착용', nums: [132, 336, 445, 488, 542, 460, 554, 245, 495, 162] },
  { title: '생활용품', nums: [20, 313, 455, 351, 323, 441, 135, 146] },
  { title: '돈·사고팔기', nums: [80, 61, 219, 186, 231, 401] },
  { title: '학교·공부·언어', nums: [129, 375, 450, 208, 334, 250, 259, 209, 599, 414, 60, 123, 147, 595, 342, 436, 508, 34, 480, 506, 517, 307, 471, 396, 482, 98, 155, 484, 280] },
  { title: '일·업무', nums: [32, 239, 244, 310, 405, 427, 329, 527, 296, 434, 435, 564, 600, 555, 553, 422, 593, 474, 543, 349, 337, 325, 386] },
  { title: '형용사 — 크기·속도·거리 (반의어)', nums: [13, 119, 179, 302, 158, 361, 212, 220, 285, 203, 352] },
  { title: '형용사 — 상태·평가 (반의어)', nums: [265, 433, 447, 472, 35, 399, 469, 493, 410, 369, 378, 332, 569, 538, 536, 321, 23, 92, 165, 175] },
  { title: '감정·성격 형용사', nums: [30, 213, 214, 221, 470, 497, 583, 346, 393, 370, 459, 492, 343, 491, 439, 77, 304, 483, 573, 589, 540] },
  { title: '동사 — 생각·인지·심리', nums: [1, 126, 575, 268, 116, 205, 490, 568, 520, 539, 295, 465, 451, 174, 86, 417, 528, 552, 594, 387] },
  { title: '동사 — 말하기·소통', nums: [102, 180, 258, 195, 411, 201, 45, 262, 443, 413, 576, 194, 125, 82, 592, 311, 154, 318] },
  { title: '동사 — 일상 동작', nums: [49, 50, 109, 101, 234, 148, 580, 145, 149, 48, 385, 291, 171, 230, 255, 368, 466, 418, 419, 247, 254, 207, 425, 341, 317, 372, 348, 373, 581, 582, 571, 400, 438, 267] },
  { title: '통신·디지털·미디어', nums: [14, 17, 18, 246, 496, 354, 544, 547, 498, 585, 584, 566] },
  { title: '취미·운동·문화', nums: [303, 546, 19, 159, 251, 282, 286, 167, 252, 477, 324, 319, 518, 423, 392, 454, 532, 398, 574, 363] },
  { title: '정도·부정 부사', nums: [7, 64, 38, 107, 293, 299, 381, 408, 177, 513, 426, 157] },
  { title: '조사', nums: [15, 54, 59, 71, 151, 301, 292, 187, 170, 350] },
  { title: '부사 (또·단지·모두 등)', nums: [275, 188, 572, 204, 327, 21, 586, 560, 279, 222, 557, 558, 287, 577] },
  { title: '조동사 (가능·당위)', nums: [72, 211, 210, 41, 274, 563, 559, 376] },
  { title: '접속사·전치사', nums: [36, 164, 215, 261, 529, 531, 278, 248, 168, 510, 494, 367, 406, 394, 339, 388, 382, 499, 238, 345, 485, 486, 156] },
  { title: '개사 (把·被·给·跟)', nums: [306, 315, 182, 380] },
  { title: '인사·존재 표현', nums: [8, 22, 65, 139, 111, 96, 136, 138] },
];

// ── 검증: 1..600 전부 정확히 한 번씩 들어갔는지 ──────────────
const seen = {};
const dups = [];
GROUPS.forEach(function (g) {
  g.nums.forEach(function (n) {
    if (seen[n]) dups.push(n);
    seen[n] = true;
    if (!byNum[n]) console.warn('경고: 존재하지 않는 번호 ' + n);
  });
});
const missing = [];
Object.keys(byNum).forEach(function (n) { if (!seen[n]) missing.push(Number(n)); });
if (dups.length) console.warn('중복 번호: ' + dups.sort(function (a, b) { return a - b; }).join(', '));
if (missing.length) console.warn('누락 번호: ' + missing.sort(function (a, b) { return a - b; }).join(', '));

// ── HTML 렌더 ───────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
  });
}
let total = 0;
const sections = GROUPS.map(function (g) {
  const cards = g.nums.map(function (n) {
    const w = byNum[n];
    if (!w) return '';
    total++;
    return '<div class="card">' +
      '<div class="front">' + esc(w.front) + '</div>' +
      '<div class="reading">' + esc(w.reading) + '</div>' +
      '<div class="meaning">' + esc(w.meaning) + '</div></div>';
  }).join('\n');
  return '<section><h2>' + esc(g.title) +
    ' <span class="badge">' + g.nums.length + '개</span></h2>' +
    '<div class="grid">' + cards + '</div></section>';
}).join('\n');

const html = '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + esc(set.title) + ' — 뜻별 묶음</title>\n<style>\n' +
  ':root{--accent:#2563eb;--line:#e5e7eb;--ink:#111827;--muted:#6b7280;}\n' +
  '*{box-sizing:border-box;}\n' +
  'body{font-family:"Malgun Gothic","Microsoft YaHei",system-ui,sans-serif;color:var(--ink);' +
  'max-width:1100px;margin:0 auto;padding:32px 24px;line-height:1.4;background:#f8fafc;}\n' +
  'h1{font-size:26px;margin:0 0 4px;}\n' +
  '.lead{color:var(--muted);margin:0 0 24px;}\n' +
  'section{margin:0 0 26px;}\n' +
  'h2{font-size:17px;border-bottom:2px solid var(--accent);padding-bottom:6px;margin:22px 0 12px;}\n' +
  '.badge{font-size:12px;font-weight:600;color:var(--accent);}\n' +
  '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}\n' +
  '.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 12px;' +
  'text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.04);page-break-inside:avoid;' +
  'display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;min-height:120px;}\n' +
  '.front{font-size:30px;font-weight:700;line-height:1.1;}\n' +
  '.reading{font-size:15px;color:var(--accent);}\n' +
  '.meaning{font-size:14px;color:var(--ink);}\n' +
  '@media print{body{padding:0;max-width:none;background:#fff;}.card{box-shadow:none;}}\n' +
  '</style></head><body>\n' +
  '<h1>' + esc(set.title) + '</h1>\n' +
  '<p class="lead">비슷한 뜻끼리 묶음 · 총 ' + total + '단어 · ' + GROUPS.length + '개 그룹</p>\n' +
  sections + '\n</body></html>';

const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'hsk3-by-meaning.html'), html);
console.log('완료: ' + total + '단어, ' + GROUPS.length + '개 그룹 → ' + path.join('tools', 'out', 'hsk3-by-meaning.html'));
