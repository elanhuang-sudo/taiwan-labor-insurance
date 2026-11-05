# 每週自動檢查「明年資料」是否公布

每年 11～12 月，勞保局、健保署、國稅局會陸續公布**次年度**的級距與費率。
這支腳本每週一早上 9 點自動檢查 6 個官方頁面，**發現新年度資料就發 Telegram**，
由人工確認後再更新 `tool.kscpb.com` 的網頁。

## 運作方式

| 項目 | 內容 |
|---|---|
| 執行時間 | **每週一 09:00**（Windows 排程工作 `KSCPB-檢查明年勞健保資料`） |
| 執行身分 | 目前登入使用者（Interactive），需開機且已登入 |
| 錯過處理 | 開啟「**錯過排程後盡快執行**」，關機期間漏掉的會在下次開機後補跑 |
| 通知管道 | Telegram（`@dsh_kscpb_bot` → chat `725946654`） |
| 狀態檔 | `data/next-year-state.json`（記錄哪些來源已通知過，避免每週重複打擾） |
| 執行紀錄 | `data/check.log`（每次每來源一行）、`data/run.log`（排程層級） |

## 檢查的 6 個來源

| 代號 | 名稱 | 機關 | 網址 |
|---|---|---|---|
| `bli-grade` | 勞保投保薪資分級表 | 勞動部勞工保險局 | <https://www.bli.gov.tw/0005475.html> |
| `bli-share` | 勞保就保分擔金額表 | 勞動部勞工保險局 | <https://www.bli.gov.tw/0011588.html> |
| `bli-pension` | 勞退月提繳工資分級表 | 勞動部勞工保險局 | <https://www.bli.gov.tw/0013083.html> |
| `nhi-share` | 健保保險費負擔金額表(三) | 中央健康保險署 | <https://www.nhi.gov.tw/ch/cp-19418-9eefb-2576-1.html> |
| `nhi-grade` | 健保投保金額分級表 | 中央健康保險署 | <https://www.nhi.gov.tw/ch/cp-19421-f9533-2569-1.html> |
| `ntbna-wht` | 薪資所得扣繳稅額表 | 財政部北區國稅局 | <https://www.ntbna.gov.tw/multiplehtml/b77824d42c5f462c8cce3fb775057cb0> |

判定方式：在頁面 HTML 中找「`116 年`／`116 年度`／`116.01.01`」這幾種寫法。
只認這三種，避免誤抓金額（例如 `116,000`）。

## 指令

```powershell
$py = "C:\Users\黃鈞煜\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"

# 正常檢查（會發 TG）
& $py .\check-next-year.py

# 只看結果，不發 TG
& $py .\check-next-year.py --dry

# 驗證 TG 通道（送一則「這是自測」的通知）
& $py .\check-next-year.py --selftest

# 測試「找到資料」的完整流程（把目標年度指定成已存在的 115）
& $py .\check-next-year.py --target-year 115

# 忽略「已通知過」的紀錄，重新通知
& $py .\check-next-year.py --force
```

## 為什麼用 curl 而不是 Python 的 urllib

健保署（`nhi.gov.tw`）前面有 Cloudflare，它會擋 **Python urllib 的 TLS 指紋**（回 403），
但 **Windows 內建 curl 帶 Chrome User-Agent 可以正常取得 200**。
所以 `fetch()` 改用 `subprocess` 呼叫 `curl`。

> ⚠️ Windows 內建 curl（8.4.0 Schannel）**不支援 `--compressed`**，
> 加了會回 `option --compressed: the installed libcurl version doesn't support this`。

## 為什麼跑在本機而不是 VPS

實測結果：

| 來源 | 本機 | VPS（Contabo） |
|---|---|---|
| 勞保局 `bli.gov.tw` | ✅ 200 | ✅ 200 |
| 國稅局 `ntbna.gov.tw` | ✅ 200 | ✅ 200 |
| **健保署 `nhi.gov.tw`** | ✅ **200** | ❌ **403**（Cloudflare 擋機房 IP） |

VPS 抓不到健保署，所以整個檢查放在本機執行。
代價是**週一早上機器必須開著**；若關機，`StartWhenAvailable` 會在下次開機後補跑。

## 沒發現時不打擾

- 沒有新發現 → **不發任何通知**（避免每週一封「還沒公布」的垃圾訊息）
- 有發現 → 發一次，並記錄到 `notified`，之後每週不會重複發同一個來源
- 全部來源都抓不到（網路斷線／被擋）→ 發一則「檢查失敗」提醒

## 收到通知後要做什麼

1. 點開通知裡的網址，確認數字正確
2. 回報給我，或自己依 `README.md` 的「更新資料」章節改
3. 更新完把 `data/next-year-state.json` 的 `notified` 清空（或直接刪檔），
   這樣明年的檢查會重新從乾淨狀態開始

## 排程管理

```powershell
# 看狀態
Get-ScheduledTaskInfo -TaskName "KSCPB-檢查明年勞健保資料"

# 立即執行一次
Start-ScheduledTask -TaskName "KSCPB-檢查明年勞健保資料"

# 暫停 / 恢復
Disable-ScheduledTask -TaskName "KSCPB-檢查明年勞健保資料"
Enable-ScheduledTask  -TaskName "KSCPB-檢查明年勞健保資料"

# 完全移除
Unregister-ScheduledTask -TaskName "KSCPB-檢查明年勞健保資料" -Confirm:$false
```

## 2026-11-05 建置時實測結果

```
勞保投保薪資分級表    ：尚無 116 年（目前 115 年 4 處）
勞保就保分擔金額表    ：尚無 116 年（目前 115 年 12 處）
勞退月提繳工資分級表  ：尚無 116 年（目前 115 年 4 處）
健保保險費負擔金額表三：尚無 116 年（目前 115 年 12 處）
健保投保金額分級表    ：尚無 116 年（目前 115 年 13 處）
薪資所得扣繳稅額表    ：尚無 116 年（目前 115 年 12 處）
```

6 個來源全部正常連線、都還沒公布 116 年度。排程下次執行：**2026-11-09（週一）09:00**。
