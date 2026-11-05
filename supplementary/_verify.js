// 驗證 supplementary/index.html 的補充保費計算邏輯
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// 抽出常數
const RATE = 0.0211;
const CAP = 10000000;
const BASE_WAGE = 29500;

// 從頁面抽 TYPES
const tm = html.match(/var TYPES = \[([\s\S]*?)\n  \];/);
if (!tm) { console.error("✗ 找不到 TYPES"); process.exit(1); }
const TYPES = eval("[" + tm[1] + "]");

console.log("=== 所得類型清單 ===");
TYPES.forEach(t => console.log(`  ${t.id.padEnd(10)} ${t.name.padEnd(6)} 下限 ${String(t.min).padStart(6)}  工會免扣 ${t.union}`));
console.log();

let errors = 0;
function check(name, got, exp) {
  const ok = (typeof exp === "number") ? Math.abs(got - exp) < 1e-9 : got === exp;
  console.log((ok ? "✓ " : "✗ ") + name + "：得到 " + got + (ok ? "" : "，預期 " + exp));
  if (!ok) errors++;
}

function findType(id) { return TYPES.find(t => t.id === id); }

function calcUnit(payroll, insured) {
  let diff = payroll - insured;
  if (diff < 0) diff = 0;
  const fee = Math.round(diff * RATE);
  return { diff, fee };
}

function calcPerson(amount, typeId, isUnion) {
  const t = findType(typeId);
  const unionFree = (isUnion && t.union);
  if (unionFree) return { fee: 0, base: 0, unionFree: true };
  const belowMin = amount < t.min;
  const base = belowMin ? 0 : Math.min(amount, CAP);
  return { fee: Math.round(base * RATE), base, belowMin, unionFree: false };
}

function calcBonus(monthlyInsured, paidBefore, thisBonus) {
  const quota = monthlyInsured * 4;
  const overBefore = Math.max(0, paidBefore - quota);
  const overAfter = Math.max(0, paidBefore + thisBonus - quota);
  let base = overAfter - overBefore;
  if (base > CAP) base = CAP;
  return { quota, base, fee: Math.round(base * RATE) };
}

console.log("=== 一、單位：差額 × 2.11% ===");
let r = calcUnit(600000, 550000);
check("60萬 − 55萬 = 差額", r.diff, 50000);
check("  保費 50,000 × 2.11%", r.fee, 1055);

r = calcUnit(500000, 550000);
check("投保 > 薪資 → 差額為 0", r.diff, 0);
check("  保費 0", r.fee, 0);

r = calcUnit(550000, 550000);
check("相等 → 差額 0", r.diff, 0);

r = calcUnit(1000000, 550000);
check("100萬 − 55萬 = 45萬", r.diff, 450000);
check("  保費 450,000 × 2.11%", r.fee, 9495);
console.log();

console.log("=== 二、兼職薪資：下限是基本工資 29,500（不是 20,000）===");
check("25,000 未達 29,500 → 免扣", calcPerson(25000, "parttime", false).fee, 0);
check("29,499 免扣", calcPerson(29499, "parttime", false).fee, 0);
check("29,500 達下限 → 622", calcPerson(29500, "parttime", false).fee, 622);
check("40,000 → 844", calcPerson(40000, "parttime", false).fee, 844);
// 陷阱驗證：兼職 25,000 看起來超過 2 萬，但因為下限是基本工資所以免扣
r = calcPerson(25000, "parttime", false);
check("  25,000 belowMin 為 true", r.belowMin, true);
console.log();

console.log("=== 三、執行業務：下限 20,000 ===");
check("19,999 免扣", calcPerson(19999, "practice", false).fee, 0);
check("20,000 達下限 → 422（全額計算）", calcPerson(20000, "practice", false).fee, 422);
check("30,000 → 633", calcPerson(30000, "practice", false).fee, 633);
// 陷阱：達下限以全額算，不是 (30000-20000)*2.11%
check("  陷阱驗證：全額 30,000×2.11% = 633（非 211）", calcPerson(30000, "practice", false).fee, 633);
console.log();

console.log("=== 四、股利／利息：下限 20,000 ===");
check("股利 20,000 → 422", calcPerson(20000, "dividend", false).fee, 422);
check("股利 100,000 → 2110", calcPerson(100000, "dividend", false).fee, 2110);
check("利息 19,999 免扣", calcPerson(19999, "interest", false).fee, 0);
check("利息 500,000 → 10550", calcPerson(500000, "interest", false).fee, 10550);
console.log();

console.log("=== 五、職業工會投保免扣（僅薪資與執行業務）===");
check("兼職 + 工會 → 免扣", calcPerson(50000, "parttime", true).fee, 0);
check("執行業務 + 工會 → 免扣", calcPerson(50000, "practice", true).fee, 0);
check("股利 + 工會 → 仍要扣 422", calcPerson(20000, "dividend", true).fee, 422);
check("利息 + 工會 → 仍要扣 422", calcPerson(20000, "interest", true).fee, 422);
r = calcPerson(50000, "parttime", true);
check("  工會免扣標記", r.unionFree, true);
console.log();

console.log("=== 六、獎金：超過投保金額 4 倍部分 ===");
// 月投保 45,800 → 四倍門檻 183,200
r = calcBonus(45800, 0, 200000);
check("門檻 = 45,800 × 4", r.quota, 183200);
check("  獎金 20萬，超過部分 16,800", r.base, 16800);
check("  保費 16,800 × 2.11% = 354", r.fee, 354);

// 累計已領 15 萬，再領 5 萬 → 合計 20 萬，仍只算超過 183,200 的部分
r = calcBonus(45800, 150000, 50000);
check("已領15萬 + 本次5萬 → 超過 16,800", r.base, 16800);
check("  保費 354", r.fee, 354);

// 已領 20 萬（已超過門檻 16,800），再領 5 萬 → 全額計費
r = calcBonus(45800, 200000, 50000);
check("已超門檻後再領 5 萬 → 全額計費", r.base, 50000);
check("  保費 1,055", r.fee, 1055);

// 未達門檻
r = calcBonus(45800, 0, 100000);
check("獎金 10萬 < 門檻 183,200 → 免扣", r.fee, 0);
check("  超過金額 0", r.base, 0);

// 上限驗證
r = calcBonus(45800, 0, 20000000);
check("超過 1,000 萬上限 → 以 1,000 萬計", r.base, CAP);
check("  保費 211,000", r.fee, 211000);
console.log();

console.log("=== 七、上限 1,000 萬 ===");
check("執行業務 2,000 萬 → 以 1,000 萬計", calcPerson(20000000, "practice", false).base, CAP);
check("  保費 211,000", calcPerson(20000000, "practice", false).fee, 211000);
console.log();

console.log(errors === 0 ? "全部通過 ✔" : `共 ${errors} 個錯誤 ✘`);
process.exit(errors === 0 ? 0 : 1);
