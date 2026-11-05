# 用官方檔案核對 index.html 的 ROWS
#  勞保：勞保局 ODS「勞工保險普通事故及就業保險合計之保險費分擔金額表」(115.1.1)
#  健保：健保署「全民健康保險保險費負擔金額表(三)」(115.1.1)
import json, re, io, sys, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ODS_JSON = os.path.join(BASE, "verify", "official-bli-115.json")
NHI_TXT = os.path.join(BASE, "verify", "official-nhi-115.txt")
HTML = os.path.join(BASE, "labor-insurance", "index.html")
REPORT = os.path.join(BASE, "verify", "report.txt")

lines = []
err = 0

def log(s=""):
    lines.append(s)

# ---------- 讀官方勞保 ----------
bli = json.load(open(ODS_JSON, encoding="utf-8"))
bli = {int(k): v for k, v in bli.items()}
log(f"官方勞保分擔表：{len(bli)} 級（{min(bli)} ~ {max(bli)}）")

# ---------- 讀官方健保 ----------
nhi = {}
for line in open(NHI_TXT, encoding="utf-8"):
    parts = line.split()
    if len(parts) == 8 and parts[0].isdigit():
        lvl = int(parts[0])
        wage = int(parts[1].replace(",", ""))
        worker = int(parts[2])          # 本人
        employer = int(parts[6])        # 投保單位負擔
        nhi[wage] = {"level": lvl, "worker": worker, "employer": employer}
log(f"官方健保負擔表：{len(nhi)} 級（{min(nhi)} ~ {max(nhi)}）")
log()

# ---------- 讀網頁 ROWS ----------
html = open(HTML, encoding="utf-8").read()
m = re.search(r"var ROWS = (\[[\s\S]*?\n  \]);", html)
rows = eval(m.group(1))
F = {"no": 0, "lv": 1, "li": 2, "le": 3, "wf": 4, "hi": 5, "he": 6, "lp": 7, "ti": 8, "te": 9, "memo": 10}
log(f"網頁 ROWS：{len(rows)} 列")
log()

# ---------- 比對勞保 ----------
log("=== 勞保（含就保）比對 ===")
for r in rows:
    lv = r[F["lv"]]
    if lv not in bli:
        continue
    w = bli[lv]["worker"]
    e = bli[lv]["employer"]
    ok = (w == r[F["li"]]) and (e == r[F["le"]])
    if not ok:
        log(f"✗ {lv}：網頁 {r[F['li']]}/{r[F['le']]} vs 官方 {w}/{e}")
        err += 1
bli_ok = sum(1 for r in rows if r[F["lv"]] in bli)
log(f"比對 {bli_ok} 級 → " + ("全部相符 ✔" if err == 0 else f"{err} 筆不符 ✘"))
log()

# ---------- 比對健保 ----------
log("=== 健保（本人 / 投保單位）比對 ===")
err2 = 0
nhi_ok = 0
for r in rows:
    lv = r[F["lv"]]
    if lv not in nhi:
        continue
    nhi_ok += 1
    w = nhi[lv]["worker"]
    e = nhi[lv]["employer"]
    if w != r[F["hi"]]:
        log(f"✗ {lv} 健保-勞工：網頁 {r[F['hi']]} vs 官方 {w}")
        err2 += 1
    if e != r[F["he"]]:
        log(f"✗ {lv} 健保-單位：網頁 {r[F['he']]} vs 官方 {e}")
        err2 += 1
log(f"比對 {nhi_ok} 級 → " + ("全部相符 ✔" if err2 == 0 else f"{err2} 筆不符 ✘"))
log()

# ---------- 比對勞退（公式：min(max(工資,1500),150000) × 6%）----------
log("=== 勞退 6%（下限 1,500／上限 150,000）比對 ===")
err3 = 0
for r in rows:
    lv = r[F["lv"]]
    base = min(max(lv, 1500), 150000)
    expect = round(base * 0.06)
    if expect != r[F["lp"]]:
        log(f"✗ {lv}：網頁 {r[F['lp']]} vs 公式 {expect}")
        err3 += 1
log(f"比對 {len(rows)} 級 → " + ("全部相符 ✔" if err3 == 0 else f"{err3} 筆不符 ✘"))
log()

# ---------- 比對墊償（勞保投保薪資 × 0.025%，四捨五入）----------
log("=== 墊償基金 0.025% 比對（四捨五入，非銀行家捨入）===")
err4 = 0

def half_up(x):
    """台灣慣例四捨五入（0.5 進位），避免 Python 內建 round 的銀行家捨入"""
    import math
    return int(math.floor(x + 0.5))

for r in rows:
    lv = r[F["lv"]]
    base = min(max(lv, 11100), 45800)
    expect = half_up(base * 0.00025)
    if expect != r[F["wf"]]:
        log(f"✗ {lv}：網頁 {r[F['wf']]} vs 公式 {expect}（原值 {base * 0.00025}）")
        err4 += 1
log(f"比對 {len(rows)} 級 → " + ("全部相符 ✔" if err4 == 0 else f"{err4} 筆不符 ✘"))
log()

# ---------- 合計一致性 ----------
log("=== 合計＝各項加總 ===")
err5 = 0
for r in rows:
    if r[F["li"]] + r[F["hi"]] != r[F["ti"]]:
        log(f"✗ {r[F['lv']]} 勞工合計")
        err5 += 1
    if r[F["le"]] + r[F["wf"]] + r[F["he"]] + r[F["lp"]] != r[F["te"]]:
        log(f"✗ {r[F['lv']]} 單位合計")
        err5 += 1
log("全部相符 ✔" if err5 == 0 else f"{err5} 筆不符 ✘")
log()

total = err + err2 + err3 + err4 + err5
log("=" * 40)
log("總錯誤數：" + str(total))
log("結果：" + ("全部通過 ✔" if total == 0 else "有錯誤 ✘"))

io.open(REPORT, "w", encoding="utf-8").write("\n".join(lines))
print("report written, errors =", total)
