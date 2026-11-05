// 驗證 rent/index.html 的計算邏輯與原始 Google 試算表一致
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "index.html");
const html = fs.readFileSync(file, "utf8");

// 抽出 calc 函數原始碼並執行
const m = html.match(/function calc\(amount, mode, whRate, shRate\)\{[\s\S]*?\n  \}/);
if (!m) { console.error("✗ 找不到 calc 函數"); process.exit(1); }

const WH_TAX_FREE = 2000;
const SH_MIN_BASE = 20000;
const calc = eval("(" + m[0] + ")");

let errors = 0;
function check(name, got, exp, tol = 0) {
  const ok = Math.abs(got - exp) <= tol;
  console.log((ok ? "✓ " : "✗ ") + name + "：得到 " + got + (ok ? "" : "，預期 " + exp));
  if (!ok) errors++;
}

console.log("=== 對照原始 Google 試算表（租金 20,000、扣繳 10%、補充保費 2.11%）===\n");

// ---- 情境 1：含稅（原表 C4="Y"，C3=20000）----
// 原表結果：扣繳 0、補充保費 422、房東實收 19,578、申報租金 20,000
const g = calc(20000, "gross", 0.10, 0.0211);
console.log("【情境 1】租金含稅 20,000");
check("  扣繳", g.wh, 0);
check("  補充保費", g.sh, 422);
check("  房東實拿", g.net, 19578);
check("  租金總額", g.total, 20000);
check("  公司支出", g.cost, 20000);
console.log();

// ---- 情境 2：不含稅（房東實拿 20,000）----
// 原表公式：扣繳 = ROUNDDOWN(20000/(1-0.1-0.0211)*0.1, 0) = 2275
//          補充保費 = 20000/(1-0.1-0.0211)*0.0211 = 480.14
//          申報租金 = 20000 + 2275 + 480 = 22755
const n = calc(20000, "net", 0.10, 0.0211);
console.log("【情境 2】房東實拿 20,000（稅外加）");
check("  扣繳", n.wh, 2275);
check("  補充保費", n.sh, 480, 1);
check("  房東實拿", n.net, 20000);
check("  租金總額", n.total, 22756, 1);
check("  公司支出", n.cost, 22756, 1);
console.log();

// ---- 門檻測試 ----
console.log("=== 門檻邊界 ===");
// 租金 20,000 含稅：扣繳 2,000 不超過門檻 → 免扣；補充保費 422 要扣
let a = calc(20000, "gross", 0.10, 0.0211);
check("20,000 含稅 → 扣繳免扣", a.wh, 0);
check("20,000 含稅 → 補充保費要扣", a.sh, 422);

// 租金 20,010 含稅：扣繳 2,001 > 2,000 → 要扣
a = calc(20010, "gross", 0.10, 0.0211);
check("20,010 含稅 → 扣繳要扣", a.wh, 2001);

// 租金 19,999 含稅：補充保費未達 20,000 → 免扣
a = calc(19999, "gross", 0.10, 0.0211);
check("19,999 含稅 → 補充保費免扣", a.sh, 0);
check("19,999 含稅 → 扣繳免扣", a.wh, 0);
check("19,999 含稅 → 實拿等於租金", a.net, 19999);
console.log();

// ---- 非居住者 20% ----
console.log("=== 非居住者扣繳 20%（原則上不扣補充保費）===");
// 依全民健康保險法第 31 條，非居住者原則上非健保保險對象 → 補充保費 0
a = calc(50000, "gross", 0.20, 0);
check("50,000 含稅 20% → 扣繳", a.wh, 10000);
check("50,000 含稅 20% → 補充保費 0（非保險對象）", a.sh, 0);
check("50,000 含稅 20% → 房東實拿", a.net, 40000);
// 例外：若仍具健保身分，仍應扣 2.11%
a = calc(50000, "gross", 0.20, 0.0211);
check("  （例外）若具健保身分 → 補充保費", a.sh, 1055);
console.log();

// ---- 一致性：公司支出 = 實拿 + 扣繳 + 補充保費 ----
// ============================================================
// 回歸測試：兩個已修正的 bug（2026-11-05）
// ============================================================
console.log("=== 回歸：扣繳門檻須先捨去再比較（20,001~20,009 應免扣）===");
// bug：原用「稅額原始值 > 2,000」判斷，導致 20,001~20,009 被扣 2,000 元
// 正確：應扣稅額元以下捨去後，再看是否 > 2,000
[20000, 20001, 20005, 20009].forEach(v => {
  const r = calc(v, "gross", 0.10, 0.0211);
  check(`  ${v} 含稅 → 扣繳應為 0（捨去後 2,000 不超過門檻）`, r.wh, 0);
});
[20010, 20011].forEach(v => {
  const r = calc(v, "gross", 0.10, 0.0211);
  const exp = Math.floor(v * 0.1);
  check(`  ${v} 含稅 → 扣繳 ${exp}（超過門檻）`, r.wh, exp);
});
console.log();

console.log("=== 回歸：房東實拿未達 20,000 不應回推 ===");
// bug：原無條件假設兩者都扣再回推，導致實拿 19,000 被算成總額 21,617
// 正確：實拿 < 20,000 時，總額 = 實拿，無稅費
[15000, 17800, 19000, 19999].forEach(v => {
  const r = calc(v, "net", 0.10, 0.0211);
  check(`  實拿 ${v} → 總額應等於實拿`, r.total, v);
  check(`  實拿 ${v} → 扣繳 0`, r.wh, 0);
  check(`  實拿 ${v} → 保費 0`, r.sh, 0);
});
console.log();

console.log("=== 恆等式檢查 ===");
let eqErr = 0;
[10000, 15000, 19999, 20000, 20010, 25000, 30000, 50000, 100000, 250000].forEach(v => {
  ["net", "gross"].forEach(mode => {
    const r = calc(v, mode, 0.10, 0.0211);
    const sum = r.net + r.wh + r.sh;
    if (Math.abs(sum - r.cost) > 1) {
      console.log(`✗ ${mode} ${v}：實拿 ${r.net} + 扣繳 ${r.wh} + 保費 ${r.sh} = ${sum} ≠ 支出 ${r.cost}`);
      eqErr++;
    }
  });
});
console.log(eqErr === 0 ? "✓ 所有組合：實拿＋扣繳＋保費＝公司支出" : `✗ ${eqErr} 組不符`);
errors += eqErr;
console.log();

// ---- 房東實拿模式：模擬金額是否等於輸入 ----
console.log("=== 回推驗證（房東實拿模式）===");
let backErr = 0;
[21000, 25000, 30000, 50000, 100000].forEach(v => {
  const r = calc(v, "net", 0.10, 0.0211);
  // 用回推的總額再正算一次，實拿應該等於輸入
  const re = calc(r.total, "gross", 0.10, 0.0211);
  if (Math.abs(re.net - v) > 1) {
    console.log(`✗ 實拿 ${v} → 總額 ${Math.round(r.total)} → 反算實拿 ${re.net}`);
    backErr++;
  } else {
    console.log(`✓ 實拿 ${v} → 總額 ${Math.round(r.total)} → 反算 ${re.net}`);
  }
});
errors += backErr;
console.log();

console.log(errors === 0 ? "全部通過 ✔" : `共 ${errors} 個錯誤 ✘`);
process.exit(errors === 0 ? 0 : 1);
