# 產生 withholding/index.html（把官方稅額表注入樣板）
#
# 用法：
#   python build/withholding-from-ods.py <官方 ODS 路徑>
#
# 官方 ODS 來源（115 年度薪資所得扣繳稅額表）：
#   https://www.ntbca.gov.tw/download/8a42e9511ba449fe84b5264292a636f7
#
# 本腳本會：
#   1. 解析 ODS（結構：c0=上界、c1="a ~ b" 標籤、c2~c13=0~11 位扶養親屬稅額）
#   2. 產生精簡資料（移除尾端 0）
#   3. 注入 build/withholding-template.html 的 __TABLE_DATA__ 標記
#   4. 寫出 withholding/index.html 與 verify/official-withholding-115.json
import zipfile, io, json, re, sys, os
import xml.etree.ElementTree as ET

T = "urn:oasis:names:tc:opendocument:xmlns:table:1.0"
O = "urn:oasis:names:tc:opendocument:xmlns:office:1.0"
NS = {"table": T, "office": O}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(ROOT, "build", "withholding-template.html")
OUT_HTML = os.path.join(ROOT, "withholding", "index.html")
OUT_JSON = os.path.join(ROOT, "verify", "official-withholding-115.json")

if len(sys.argv) < 2:
    raise SystemExit("用法：python build/withholding-from-ods.py <官方 ODS 路徑>")

src = sys.argv[1]

def num(x):
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return None

with zipfile.ZipFile(src) as z:
    root = ET.fromstring(z.read("content.xml"))

sheet = root.findall(".//table:table", NS)[0]
rows = []
for row in sheet.findall("table:table-row", NS):
    rrep = int(row.get("{%s}number-rows-repeated" % T, "1"))
    cells = []
    for cell in list(row):
        tag = cell.tag.split("}")[-1]
        if tag not in ("table-cell", "covered-table-cell"):
            continue
        crep = int(cell.get("{%s}number-columns-repeated" % T, "1"))
        if tag == "covered-table-cell":
            v = ""
        else:
            val = cell.get("{%s}value" % O)
            txt = "".join(cell.itertext()).strip()
            v = val if val is not None else txt
        for _ in range(min(crep, 60)):
            cells.append(v)
    for _ in range(min(rrep, 60)):
        rows.append(cells)

data = []
for r in rows:
    if len(r) < 14:
        continue
    label = str(r[1]).strip()
    m = re.match(r"^([\d,]+)\s*[~～]\s*([\d,]+)$", label)
    if not m:
        continue
    low = int(m.group(1).replace(",", ""))
    high = int(m.group(2).replace(",", ""))
    amts = [num(r[2 + k]) or 0 for k in range(12)]
    data.append({"low": low, "high": high, "label": label, "amt": amts})

if not data:
    raise SystemExit("解析失敗：找不到任何資料列")

print(f"解析資料列：{len(data)}（{data[0]['low']} ～ {data[-1]['high']}）")

# 官方快照
with io.open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)

# 精簡資料（移除尾端 0）
compact = []
for d in data:
    amts = list(d["amt"])
    while amts and amts[-1] == 0:
        amts.pop()
    compact.append([d["low"]] + amts)

js = json.dumps(compact, separators=(",", ":"))

tpl = io.open(TPL, encoding="utf-8").read()
if "__TABLE_DATA__" not in tpl:
    raise SystemExit("樣板缺少 __TABLE_DATA__ 標記")

io.open(OUT_HTML, "w", encoding="utf-8", newline="\n").write(tpl.replace("__TABLE_DATA__", js))

print(f"已寫出 {OUT_HTML}（{len(compact)} 列，資料 {len(js)} 字元）")
print("完成後請執行：node withholding/_verify.js")
