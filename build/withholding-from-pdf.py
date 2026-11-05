# 從北區國稅局 115 年度 PDF 重建稅額表（正確版）
# 表格結構：第 0 欄 = "a ~ b"，第 1~12 欄 = 0~11 位扶養親屬的扣繳稅額
import io, json, re, os
import pdfplumber

ROOT = r"C:\Users\黃鈞煜\Downloads\DEEPSEEK\labor-insurance-2026"
PDF = os.path.join(ROOT, "_src2", "nb_wh115.pdf")
TPL = os.path.join(ROOT, "build", "withholding-template.html")
OUT_HTML = os.path.join(ROOT, "withholding", "index.html")
OUT_JSON = os.path.join(ROOT, "verify", "official-withholding-115.json")
LOG = os.path.join(ROOT, "_src2", "pdf_build_log.txt")

log = []
rows = []

LABEL_RE = re.compile(r"^([\d,]{4,9})\s*[~～]\s*([\d,]{4,9})$")

with pdfplumber.open(PDF) as pdf:
    log.append(f"PDF 頁數：{len(pdf.pages)}")
    for pi, page in enumerate(pdf.pages):
        for tb in page.extract_tables():
            for r in tb:
                if not r or not r[0]:
                    continue
                label = str(r[0]).replace("\n", " ").strip()
                m = LABEL_RE.match(label)
                if not m:
                    continue
                low = int(m.group(1).replace(",", ""))
                high = int(m.group(2).replace(",", ""))
                # 第 1~12 欄為金額
                amts = []
                ok = True
                for k in range(1, 13):
                    cell = r[k] if k < len(r) else None
                    if cell is None:
                        amts.append(0)
                        continue
                    s = str(cell).replace(",", "").replace("\n", "").strip()
                    if s == "":
                        amts.append(0)
                    elif re.match(r"^\d+$", s):
                        amts.append(int(s))
                    else:
                        ok = False
                        break
                if not ok:
                    continue
                rows.append((low, high, amts))

log.append(f"擷取資料列：{len(rows)}")

if rows:
    log.append(f"首列：{rows[0][0]} ~ {rows[0][1]}  {rows[0][2]}")
    log.append(f"末列：{rows[-1][0]} ~ {rows[-1][1]}  {rows[-1][2][:4]}")

# ---------- 完整性驗證 ----------
expected = list(range(80001, 500001, 500))
got_lows = [r[0] for r in rows]
ok_struct = (got_lows == expected)

log.append("")
log.append(f"預期 840 列，實得 {len(rows)} 列")
log.append(f"low 序列完全相符：{'是 ✓' if ok_struct else '否 ✗'}")
if not ok_struct:
    missing = sorted(set(expected) - set(got_lows))
    extra = sorted(set(got_lows) - set(expected))
    log.append(f"  缺少 {len(missing)} 個，多出 {len(extra)} 個")
    if missing:
        log.append("  缺少前 5：" + str(missing[:5]))
    if extra:
        log.append("  多出前 5：" + str(extra[:5]))

# ---------- 關鍵值抽查 ----------
log.append("")
log.append("=== 關鍵值抽查（115 年度）===")
by_low = {r[0]: r[2] for r in rows}
checks = [
    (90501, 0, 2020),
    (107501, 0, 3340),
    (107501, 2, 2030),
    (200001, 0, 17240),
    (200001, 11, 3330),
    (499501, 0, 100700),   # 115 年末列（114 年是 104,590）
]
all_ok = True
for low, dep, exp in checks:
    if low in by_low:
        got = by_low[low][dep] if dep < len(by_low[low]) else 0
        good = (got == exp)
        all_ok = all_ok and good
        log.append(f"  {low:>7} 第 {dep:>2} 位：{got:>6}　預期 {exp:>6}　{'✓' if good else '✗'}")
    else:
        all_ok = False
        log.append(f"  {low:>7}：找不到 ✗")

# ---------- 寫出 ----------
log.append("")
if len(rows) == 840 and ok_struct and all_ok:
    snap = [{"low": r[0], "high": r[1],
             "label": f"{r[0]:,} ~ {r[1]:,}", "amt": r[2]} for r in rows]
    with io.open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=1)

    compact = []
    for r in rows:
        amts = list(r[2])
        while amts and amts[-1] == 0:
            amts.pop()
        compact.append([r[0]] + amts)
    js = json.dumps(compact, separators=(",", ":"))

    tpl = io.open(TPL, encoding="utf-8").read()
    if "__TABLE_DATA__" not in tpl:
        log.append("!! 樣板缺少 __TABLE_DATA__")
    else:
        io.open(OUT_HTML, "w", encoding="utf-8", newline="\n").write(
            tpl.replace("__TABLE_DATA__", js))
        log.append("✓ 驗證通過，已寫出：")
        log.append(f"  {OUT_HTML}")
        log.append(f"  {OUT_JSON}")
        log.append(f"  資料量 {len(js)} 字元")
else:
    log.append("!! 驗證未通過，未寫出檔案")

io.open(LOG, "w", encoding="utf-8").write("\n".join(log))
print("done")
