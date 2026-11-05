// 驗證獎金算法符合健保署官方公式
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const RATE = 0.0211;
const CAP = 10000000;

// 官方公式實現
function calcBonus(monthlyInsured, paidBefore, thisBonus) {
  const quota = monthlyInsured * 4;
  const totalAfter = paidBefore + thisBonus;
  const overQuota = Math.max(0, totalAfter - quota);
  const baseRaw = Math.min(thisBonus, overQuota);
  const capped = baseRaw > CAP;
  const base = capped ? CAP : baseRaw;
  return { quota, totalAfter, overQuota, base, fee: Math.round(base * RATE) };
}

let errors = 0;
function check(name, got, exp) {
  const ok = Math.abs(got - exp) < 1e-9;
  console.log((ok ? "✓ " : "✗ ") + name + "：得到 " + got + (ok ? "" : "，預期 " + exp));
  if (!ok) errors++;
}

console.log("=== 對照健保署官方試算頁公式 ===");
console.log("1. 超過4倍 = 全年累計 − 投保金額×4");
console.log("2. 費基 = min(本次獎金, 超過4倍金額)");
console.log("3. 費基上限 1,000 萬");
console.log("4. 費基 × 2.11%");
console.log();

// 案例一：投保 45,800（門檻 183,200），首次領 200,000
let r = calcBonus(45800, 0, 200000);
check("案例1 門檻 45,800×4", r.quota, 183200);
check("     全年累計", r.totalAfter, 200000);
check("     超過四倍金額", r.overQuota, 16800);
check("     費基 = min(200000, 16800)", r.base, 16800);
check("     保費 16,800 × 2.11%", r.fee, 354);
console.log();

// 案例二：已領 150,000，本次 50,000 → 累計 200,000
r = calcBonus(45800, 150000, 50000);
check("案例2 全年累計 200,000", r.totalAfter, 200000);
check("     超過四倍 16,800", r.overQuota, 16800);
check("     費基 = min(50,000, 16,800) = 16,800", r.base, 16800);
check("     保費 354", r.fee, 354);
console.log();

// 案例三（關鍵差異）：已領 200,000（已超門檻 16,800），本次再領 50,000
r = calcBonus(45800, 200000, 50000);
check("案例3 全年累計 250,000", r.totalAfter, 250000);
check("     超過四倍 66,800", r.overQuota, 66800);
check("     費基 = min(50,000, 66,800) = 50,000", r.base, 50000);
check("     保費 1,055（不是 66,800 也不是 16,800）", r.fee, 1055);
console.log();

// 案例四：本次獎金遠大於超過額
r = calcBonus(45800, 0, 1000000);
check("案例4 本次 100 萬 > 超過額 816,800", r.overQuota, 816800);
check("     費基取較小 = 816,800", r.base, 816800);
check("     保費 17,234", r.fee, 17234);
console.log();

// 案例五：未達門檻
r = calcBonus(45800, 0, 100000);
check("案例5 累計 10 萬 < 門檻 183,200", r.overQuota, 0);
check("     費基 0", r.base, 0);
check("     保費 0", r.fee, 0);
console.log();

// 案例六：上限 1,000 萬
r = calcBonus(45800, 0, 20000000);
check("案例6 超過額 19,816,800 > 1,000 萬", r.overQuota, 19816800);

check("     費基上限 1,000 萬", r.base, 10000000);
check("     保費 211,000", r.fee, 211000);
console.log();

// 案例七：投保金額 0（避免除以錯誤）
r = calcBonus(0, 0, 50000);
check("案例7 投保 0 → 門檻 0", r.quota, 0);
check("     超過額 50,000", r.overQuota, 50000);
check("     費基 50,000", r.base, 50000);
check("     保費 1,055", r.fee, 1055);
console.log();

console.log("=== 與舊算法（本次新增的超過金額）比較 ===");
// 舊算法：overAfter - overBefore
function calcBonusOld(monthlyInsured, paidBefore, thisBonus) {
  const quota = monthlyInsured * 4;
  const overBefore = Math.max(0, paidBefore - quota);
  const overAfter = Math.max(0, paidBefore + thisBonus - quota);
  let base = overAfter - overBefore;
  if (base > CAP) base = CAP;
  return { base, fee: Math.round(base * RATE) };
}
const cases = [
  [45800, 0, 200000],
  [45800, 150000, 50000],
  [45800, 200000, 50000],
  [45800, 300000, 100000],
];
let diffCount = 0;
cases.forEach(([mi, paid, now]) => {
  const n = calcBonus(mi, paid, now);
  const o = calcBonusOld(mi, paid, now);
  const same = n.fee === o.fee;
  if (!same) diffCount++;
  console.log(`  投保${mi} 已領${paid} 本次${now}：官方 ${n.fee} / 舊版 ${o.fee} ${same ? "" : "← 不同"}`);
});
console.log();
console.log(diffCount === 0 ? "兩種算法結果相同" : `有 ${diffCount} 個案例結果不同，已改用官方算法`);

console.log();
console.log(errors === 0 ? "全部通過 ✔" : `共 ${errors} 個錯誤 ✘`);
process.exit(errors === 0 ? 0 : 1);
