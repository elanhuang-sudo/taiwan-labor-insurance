#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每週檢查政府官方網站是否已公布「明年」的勞健保／扣繳數據。

用途：本專案的資料每年要換一次（115 → 116）。
      每年 11～12 月各部會陸續公告，這支腳本每週檢查一次，
      發現新年度資料就發 Telegram 通知，由人工確認後再更新網頁。

執行：python check-next-year.py            # 正常檢查
      python check-next-year.py --dry      # 只顯示，不發 TG
      python check-next-year.py --force    # 忽略已通知紀錄，重新通知
"""

import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime

# 主控台可能是 cp950（繁中 Windows），直接輸出非 Big5 字元會 UnicodeEncodeError。
# 強制 stdout/stderr 用 UTF-8。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE, "data", "next-year-state.json")
LOG_FILE = os.path.join(BASE, "data", "check.log")

# ---- Telegram（從 secrets 讀，不硬編碼）----
TG_SECRET = r"C:\Users\黃鈞煜\.dsh\secrets\TG-連線與通知-說明.md"
TG_CHAT = "725946654"

# ---- 要檢查的官方頁面 ----
# key 用穩定的英文代號；year_pattern 決定怎麼認年份
SOURCES = [
    {
        "key": "bli-grade",
        "name": "勞保投保薪資分級表",
        "url": "https://www.bli.gov.tw/0005475.html",
        "org": "勞動部勞工保險局",
    },
    {
        "key": "bli-share",
        "name": "勞保就保分擔金額表",
        "url": "https://www.bli.gov.tw/0011588.html",
        "org": "勞動部勞工保險局",
    },
    {
        "key": "bli-pension",
        "name": "勞退月提繳工資分級表",
        "url": "https://www.bli.gov.tw/0013083.html",
        "org": "勞動部勞工保險局",
    },
    {
        "key": "nhi-share",
        "name": "健保保險費負擔金額表(三)",
        "url": "https://www.nhi.gov.tw/ch/cp-19418-9eefb-2576-1.html",
        "org": "衛生福利部中央健康保險署",
    },
    {
        "key": "nhi-grade",
        "name": "健保投保金額分級表",
        "url": "https://www.nhi.gov.tw/ch/cp-19421-f9533-2569-1.html",
        "org": "衛生福利部中央健康保險署",
    },
    {
        "key": "ntbna-wht",
        "name": "薪資所得扣繳稅額表",
        "url": "https://www.ntbna.gov.tw/multiplehtml/b77824d42c5f462c8cce3fb775057cb0",
        "org": "財政部北區國稅局",
    },
]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")


def roc_year_now():
    """目前民國年"""
    return datetime.now().year - 1911


def fetch(url, timeout=30):
    """抓頁面，回傳 (status, text)。失敗回 (None, 錯誤訊息)。

    用 curl 而非 urllib：健保署的 Cloudflare 會擋 Python urllib 的
    TLS 指紋（403），但 curl 帶 Chrome UA 可以正常取得（200）。
    """
    import subprocess
    import tempfile
    tmp = None
    try:
        fd, tmp = tempfile.mkstemp(suffix=".html")
        os.close(fd)
        cmd = [
            "curl", "-s", "-L",
            "--max-time", str(timeout),
            "-A", UA,
            "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "-H", "Accept-Language: zh-TW,zh;q=0.9",
            "-o", tmp,
            "-w", "%{http_code}",
            url,
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 10)
        code = (r.stdout or "").strip()
        if not os.path.exists(tmp) or os.path.getsize(tmp) == 0:
            return None, f"curl 無內容（code={code}）"
        raw = open(tmp, "rb").read()
        try:
            code_int = int(code)
        except ValueError:
            code_int = None
        if code_int and code_int >= 400:
            return code_int, f"HTTP {code_int}"
        for enc in ("utf-8", "big5", "cp950"):
            try:
                return code_int, raw.decode(enc)
            except UnicodeDecodeError:
                continue
        return code_int, raw.decode("utf-8", errors="ignore")
    except subprocess.TimeoutExpired:
        return None, "curl 逾時"
    except Exception as e:
        return None, str(e)
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass


def count_year(text, year):
    """計算某年度出現次數。只認「NNN年」或「NNN年度」，避免誤抓金額。"""
    pats = [
        rf"{year}\s*年度",
        rf"{year}\s*年",
        rf"{year}\.\s*0?1\.\s*0?1",   # 健保頁的 116.01.01 寫法
    ]
    total = 0
    for p in pats:
        total += len(re.findall(p, text))
    return total


def tg_token():
    """從 secrets 說明檔解析 DSH bot token"""
    if not os.path.exists(TG_SECRET):
        return None
    t = io.open(TG_SECRET, encoding="utf-8").read()
    m = re.search(r"(\d{8,12}:[A-Za-z0-9_-]{30,40})", t)
    return m.group(1) if m else None


def send_tg(text, dry=False):
    if dry:
        print("\n--- [DRY] 以下是要發送的 TG 內容 ---")
        print(text)
        print("--- [DRY] 結束 ---")
        return True
    tok = tg_token()
    if not tok:
        print("!! 找不到 TG token，無法發送", file=sys.stderr)
        return False
    url = f"https://api.telegram.org/bot{tok}/sendMessage"
    # 4096 字元上限
    if len(text) > 3900:
        text = text[:3900] + "\n…（截斷）"
    data = urllib.parse.urlencode({
        "chat_id": TG_CHAT,
        "text": text,
        "disable_web_page_preview": "true",
    }).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=25) as r:
            body = json.loads(r.read().decode())
            if not body.get("ok"):
                print("!! TG 回傳失敗：" + str(body), file=sys.stderr)
                return False
            return True
    except Exception as e:
        print("!! TG 發送例外：" + str(e), file=sys.stderr)
        return False


def load_state():
    if os.path.exists(STATE_FILE):
        try:
            return json.load(io.open(STATE_FILE, encoding="utf-8"))
        except Exception:
            pass
    return {"notified": {}, "last_run": None}


def save_state(st):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    io.open(STATE_FILE, "w", encoding="utf-8").write(
        json.dumps(st, ensure_ascii=False, indent=1))


def log(line):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with io.open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def selftest():
    """模擬發現新資料，實際發送一則 TG，驗證通知管道。"""
    cur = roc_year_now()
    nxt = cur + 1
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        f"🔔 發現 {nxt} 年度新資料（民國 {nxt} 年）",
        "",
        "（這是自測訊息，不是真的偵測到）",
        "",
        "・勞保投保薪資分級表（勞動部勞工保險局）",
        "  https://www.bli.gov.tw/0005475.html",
        "  出現 3 處「116 年」字樣",
        "・健保保險費負擔金額表(三)（衛生福利部中央健康保險署）",
        "  https://www.nhi.gov.tw/ch/cp-19418-9eefb-2576-1.html",
        "  出現 2 處「116 年」字樣",
        "",
        "→ 確認資料無誤後再更新 tool.kscpb.com，不要直接改。",
        "",
        f"檢查時間：{now}　目前民國 {cur} 年",
    ]
    ok = send_tg("\n".join(lines))
    print("自測 TG：" + ("已送出，請查看 Telegram" if ok else "發送失敗"))
    return 0 if ok else 1


def main():
    if "--selftest" in sys.argv:
        return selftest()

    dry = "--dry" in sys.argv
    force = "--force" in sys.argv

    cur = roc_year_now()      # 115
    nxt = cur + 1             # 116

    # 測試用：--target-year 115 可以把「目標年度」指定成已存在的年度，
    # 用來驗證「找到資料 → 發通知 → 記錄已通知 → 下次不重複發」的完整流程。
    for i, a in enumerate(sys.argv):
        if a == "--target-year" and i + 1 < len(sys.argv):
            try:
                nxt = int(sys.argv[i + 1])
            except ValueError:
                pass

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"檢查時間 {now}　目前民國 {cur} 年，尋找 {nxt} 年度資料")
    print("-" * 60)

    state = load_state()
    if "notified" not in state:
        state["notified"] = {}

    newly = []      # 這次新發現的
    still = []      # 之前已通知過、現在還在
    missing = []    # 抓取失敗
    notyet = []     # 還沒有新年度的

    for s in SOURCES:
        code, text = fetch(s["url"])
        if code is None:
            missing.append((s, text))
            print(f"  ?  {s['name']}：抓取失敗（{text}）")
            log(f"{now}\t{s['key']}\tFAIL\t{text}")
            continue

        n_cur = count_year(text, cur)
        n_nxt = count_year(text, nxt)
        found = n_nxt > 0

        status = "FOUND" if found else "nothing"
        log(f"{now}\t{s['key']}\t{status}\tcur={n_cur}\tnext={n_nxt}")

        if found:
            already = state["notified"].get(s["key"])
            if already and not force:
                still.append(s)
                print(f"  ●  {s['name']}：已有 {nxt} 年資料（{n_nxt} 處）〔已通知過〕")
            else:
                newly.append((s, n_nxt))
                state["notified"][s["key"]] = now
                print(f"  ★  {s['name']}：出現 {nxt} 年資料（{n_nxt} 處）")
        else:
            notyet.append(s)
            print(f"  ─  {s['name']}：尚無 {nxt} 年（目前看到 {cur} 年 {n_cur} 處）")

    state["last_run"] = now
    if not dry:
        save_state(state)

    print("-" * 60)
    print(f"新發現 {len(newly)} 項／已通知過 {len(still)} 項／"
          f"尚無 {len(notyet)} 項／失敗 {len(missing)} 項")

    # ---------- 組通知 ----------
    if newly:
        lines = [f"🔔 發現 {nxt} 年度新資料（民國 {nxt} 年）", ""]
        for s, cnt in newly:
            lines.append(f"・{s['name']}（{s['org']}）")
            lines.append(f"  {s['url']}")
            lines.append(f"  出現 {cnt} 處「{nxt} 年」字樣")
        if still:
            lines.append("")
            lines.append("先前已通知過、目前仍存在：")
            for s in still:
                lines.append(f"・{s['name']}")
        if notyet:
            lines.append("")
            lines.append("尚未公布：")
            for s in notyet:
                lines.append(f"・{s['name']}")
        lines.append("")
        lines.append("→ 確認資料無誤後再更新 tool.kscpb.com，不要直接改。")
        ok = send_tg("\n".join(lines), dry=dry)
        print("\nTG 通知：" + ("已送出" if ok else "發送失敗"))
    elif missing and len(missing) == len(SOURCES):
        # 全部失敗時也通知（可能是網路問題或被擋）
        txt = (f"⚠️ 年度資料檢查失敗\n\n所有來源都抓不到：\n" +
               "\n".join(f"・{s['name']}：{err}" for s, err in missing) +
               f"\n\n時間：{now}")
        send_tg(txt, dry=dry)
        print("\nTG 通知：已送出（全部失敗）")
    else:
        print("\n沒有新發現，不發通知（避免每週打擾）")

    return 0


if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
