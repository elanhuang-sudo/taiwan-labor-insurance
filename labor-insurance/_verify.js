// 驗證 index.html 內嵌的保費表：合計是否等於各項加總、級距是否遞增、試算邏輯是否正確
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "index.html");
const html = fs.readFileSync(file, "utf8");

const m = html.match(/var ROWS = (\[[\s\S]*?\n  \]);/);
if (!m) { console.error("✗ 找不到 ROWS 資料"); process.exit(1); }
const ROWS = eval(m[1]);
console.log("資料筆數：", ROWS.length);

let errors = 0;
const F = { no: 0, lv: 1, li: 2, le: 3, wf: 4, hi: 5, he: 6, lp: 7, ti: 8, te: 9, memo: 10 };

// 1. 每列欄位數
ROWS.forEach((r, i) => {
  if (r.length !== 11) { console.log(`✗ 第${i}列欄位數 ${r.length}`); errors++; }
});

// 2. 級距遞增
for (let i = 1; i < ROWS.length; i++) {
  if (ROWS[i][F.lv] <= ROWS[i - 1][F.lv]) {
    console.log(`✗ 級距未遞增：${ROWS[i - 1][F.lv]} → ${ROWS[i][F.lv]}`);
    errors++;
  }
}

// 3. 合計 = 各項加總（員工：勞保+健保；雇主：勞保+墊償+健保+勞退）
ROWS.forEach((r, i) => {
  const wSum = r[F.li] + r[F.hi];
  const eSum = r[F.le] + r[F.wf] + r[F.he] + r[F.lp];
  if (wSum !== r[F.ti]) { console.log(`✗ ${r[F.lv]} 員工合計 ${r[F.ti]} ≠ ${wSum}`); errors++; }
  if (eSum !== r[F.te]) { console.log(`✗ ${r[F.lv]} 雇主合計 ${r[F.te]} ≠ ${eSum}`); errors++; }
});

// 4. 級數編號 1..58 連續
const withNo = ROWS.filter(r => r[F.no] > 0);
withNo.forEach((r, i) => {
  if (r[F.no] !== i + 1) { console.log(`✗ 級數不連續：索引${i} → ${r[F.no]}`); errors++; }
});
console.log("有級數的列：", withNo.length);

// 5. 公式回推（容許 ±1 元四捨五入）
const near = (a, b) => Math.abs(a - b) <= 1;
ROWS.forEach(r => {
  const lv = r[F.lv];
  const insBase = Math.min(Math.max(lv, 11100), 45800);
  const hiBase = Math.max(lv, 29500);
  const li = insBase * 0.125 * 0.2;
  const le = insBase * 0.125 * 0.7;
  const hi = hiBase * 0.0517 * 0.3;
  const he = hiBase * 0.0517 * 0.6 * 1.56;
  const lp = Math.min(lv, 150000) * 0.06;
  const wf = insBase * 0.00025;
  const bad = [];
  if (!near(r[F.li], li)) bad.push(`勞保勞 ${r[F.li]}≈${li.toFixed(1)}`);
  if (!near(r[F.le], le)) bad.push(`勞保雇 ${r[F.le]}≈${le.toFixed(1)}`);
  if (!near(r[F.hi], hi)) bad.push(`健保勞 ${r[F.hi]}≈${hi.toFixed(1)}`);
  if (!near(r[F.he], he)) bad.push(`健保雇 ${r[F.he]}≈${he.toFixed(1)}`);
  if (!near(r[F.lp], lp)) bad.push(`勞退 ${r[F.lp]}≈${lp.toFixed(1)}`);
  if (!near(r[F.wf], wf)) bad.push(`墊償 ${r[F.wf]}≈${wf.toFixed(2)}`);
  if (bad.length) console.log(`△ ${lv}：` + bad.join("、"));
});

// 6. 級距判定邏輯
function findLevel(wage, ROWS) {
  for (let i = 0; i < ROWS.length; i++) if (wage <= ROWS[i][F.lv]) return i;
  return ROWS.length - 1;
}
const cases = [[0, 1500], [1500, 1500], [1501, 3000], [35000, 36300], [45800, 45800], [45801, 48200], [100000, 101100], [400000, 313000]];
cases.forEach(([w, exp]) => {
  const got = ROWS[findLevel(w, ROWS)][F.lv];
  console.log(got === exp ? `✓ 輸入 ${w} → ${got}` : `✗ 輸入 ${w} → ${got}（預期 ${exp}）`);
  if (got !== exp) errors++;
});

// 7. 抽樣對照原文
const samples = [[29500, 1196, 5787], [36300, 1471, 7120], [45800, 1855, 8983], [150000, 3472, 20278], [313000, 6000, 28165]];
samples.forEach(([lv, ti, te]) => {
  const r = ROWS.find(x => x[F.lv] === lv);
  const ok = r && r[F.ti] === ti && r[F.te] === te;
  console.log(ok ? `✓ ${lv}：員工 ${ti}／單位 ${te}` : `✗ ${lv} 對照失敗`);
  if (!ok) errors++;
});

console.log(errors === 0 ? "\n全部通過 ✔" : `\n共 ${errors} 個錯誤 ✘`);
process.exit(errors === 0 ? 0 : 1);
