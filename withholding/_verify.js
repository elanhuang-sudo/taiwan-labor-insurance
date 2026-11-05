// 驗證 withholding/index.html 的查表邏輯與官方 115 年度稅額表一致
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// 抽出 TABLE
const tm = html.match(/var TABLE = (\[\[[\s\S]*?\]\]);/);
if (!tm) { console.error("✗ 找不到 TABLE"); process.exit(1); }
const TABLE = JSON.parse(tm[1]);
console.log("表格列數：", TABLE.length);
console.log("首列 low：", TABLE[0][0], "／末列 low：", TABLE[TABLE.length - 1][0]);
console.log();

const ROW_SPAN = 500;
const TBL_MIN = 80001;
const RATE_5 = 0.05;
const THRESHOLD_MONTHLY = 40020;
const THRESHOLD_PARTTIME = 90501;

function lookupTable(salary, dep) {
  if (salary < TBL_MIN) return null;
  let lo = 0, hi = TABLE.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (TABLE[mid][0] <= salary) { idx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (idx < 0) return null;
  const row = TABLE[idx];
  let amt = row[1 + dep];
  if (amt === undefined) amt = 0;
  return { low: row[0], high: row[0] + ROW_SPAN - 1, amt };
}

function calc(salary, mode, dep) {
  let tax = 0;
  if (mode === "filled") {
    const r = lookupTable(salary, dep);
    tax = r ? r.amt : 0;
  } else if (mode === "notFilled") {
    tax = salary >= THRESHOLD_MONTHLY ? Math.floor(salary * RATE_5) : 0;
  } else {
    tax = salary >= THRESHOLD_PARTTIME ? Math.floor(salary * RATE_5) : 0;
  }
  return { tax, net: salary - tax };
}

let errors = 0;
function check(name, got, exp) {
  const ok = got === exp;
  console.log((ok ? "✓ " : "✗ ") + name + "：得到 " + got + (ok ? "" : "，預期 " + exp));
  if (!ok) errors++;
}

console.log("=== 對照 Google 試算表關鍵值 ===");
// 表 90501 0位=2020; 99001: [2450,2020,...]; 107501: [3340,2450,2030,...]
let r = lookupTable(90501, 0);
check("90,501 / 0 位", r.amt, 2020);
check("  區間下界", r.low, 90501);
check("  區間上界", r.high, 91000);

r = lookupTable(99001, 1);
check("99,001 / 1 位", r.amt, 2020);
r = lookupTable(99001, 0);
check("99,001 / 0 位", r.amt, 2450);

r = lookupTable(107501, 2);
check("107,501 / 2 位", r.amt, 2030);
r = lookupTable(107501, 0);
check("107,501 / 0 位", r.amt, 3340);

r = lookupTable(200001, 11);
check("200,001 / 11 位", r.amt, 3330);
r = lookupTable(200001, 0);
check("200,001 / 0 位", r.amt, 17240);
console.log();

console.log("=== 邊界與插值 ===");
check("80,001 / 0 位（表首）", lookupTable(80001, 0).amt, 0);
check("80,000 → 查無（低於表）", lookupTable(80000, 0), null);
check("90,500 / 0 位（門檻前）", lookupTable(90500, 0).amt, 0);
// 區間內任一點都對應同一列
check("90,700 落在 90,501~91,000", lookupTable(90700, 0).low, 90501);
check("90,999 落在 90,501~91,000", lookupTable(90999, 0).low, 90501);
check("91,000 落在 90,501~91,000", lookupTable(91000, 0).low, 90501);
check("91,001 進下一列", lookupTable(91001, 0).low, 91001);
check("499,900 / 0 位（表末附近）", lookupTable(499900, 0).low, 499501);
console.log();

console.log("=== 5% 模式與起扣點 ===");
check("未填 40,019 → 免扣", calc(40019, "notFilled", 0).tax, 0);
check("未填 40,020 → 2,001", calc(40020, "notFilled", 0).tax, 2001);
check("未填 50,000 → 2,500", calc(50000, "notFilled", 0).tax, 2500);
check("未填 45,123 → 2,256（捨去）", calc(45123, "notFilled", 0).tax, 2256);
check("兼職 90,500 → 免扣", calc(90500, "partTime", 0).tax, 0);
check("兼職 90,501 → 4,525", calc(90501, "partTime", 0).tax, 4525);
check("兼職 100,000 → 5,000", calc(100000, "partTime", 0).tax, 5000);
console.log();

console.log("=== 結構完整性 ===");
let structErr = 0;
for (let i = 1; i < TABLE.length; i++) {
  const diff = TABLE[i][0] - TABLE[i - 1][0];
  if (diff !== 500) {
    if (structErr < 5) console.log(`✗ 第 ${i} 列間距 ${diff}（應 500）：${TABLE[i - 1][0]} → ${TABLE[i][0]}`);
    structErr++;
  }
}
console.log(structErr === 0 ? "✓ 840 列間距皆為 500，連續無斷" : `✗ ${structErr} 處間距異常`);
errors += structErr;

// 每列最多 13 個元素（low + 12 位扶養）
let widthErr = 0;
TABLE.forEach((row, i) => {
  if (row.length > 13) { widthErr++; }
  if (row[0] % 500 !== 1) { widthErr++; }
});
console.log(widthErr === 0 ? "✓ 每列欄位數 ≤ 13，low 皆為 500n+1" : `✗ ${widthErr} 列欄位異常`);
errors += widthErr;
console.log();

console.log("=== 單調性：扶養越多，稅額不應越高 ===");
let monoErr = 0;
const samples = [90501, 120001, 200001, 300001, 400001, 499501];
samples.forEach(low => {
  const row = TABLE.find(x => x[0] === low);
  if (!row) return;
  const amts = [];
  for (let d = 0; d < 12; d++) amts.push(row[1 + d] === undefined ? 0 : row[1 + d]);
  for (let d = 1; d < 12; d++) {
    if (amts[d] > amts[d - 1]) {
      console.log(`✗ ${low} 第 ${d} 位 ${amts[d]} > 第 ${d - 1} 位 ${amts[d - 1]}`);
      monoErr++;
    }
  }
});
console.log(monoErr === 0 ? "✓ 抽查 6 列，扶養人數增加時稅額遞減或不變" : `✗ ${monoErr} 處異常`);
errors += monoErr;
console.log();

console.log(errors === 0 ? "全部通過 ✔" : `共 ${errors} 個錯誤 ✘`);
process.exit(errors === 0 ? 0 : 1);
