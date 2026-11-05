# tool.kscpb.com — 小工具站

勞動法規與行政相關的試算工具集合。**一個自訂網域、多個子路徑**，新增工具不必再動 DNS。

**網址：<https://tool.kscpb.com/>**

```
tool.kscpb.com/                   工具選單首頁
tool.kscpb.com/labor-insurance/   勞健保三合一保費試算（現有）
tool.kscpb.com/<工具名>/           以後新增的工具放這裡
```

## ⚠️ 給客戶的連結寫在 n8n 訊息模板裡

客戶收到的網址是在 **n8n workflow 的訊息內容**中寫死的，不是靠短網址。
因此**這個網址一旦發出去就不該再改** —— 改網域等於要回頭修每一個 workflow。

| 用途 | 網址 |
|---|---|
| 勞健保保費試算 | `https://tool.kscpb.com/labor-insurance/` |
| 工具總覽（首頁） | `https://tool.kscpb.com/` |

> 短網址（Rebrandly `g.kscpb.com`）**不是必要**。既有連結
> `https://g.kscpb.com/taiwan-labor-insurance` 仍保留，但它只是 301 轉址，
> 網址列最終會顯示目標網域。直接使用 `tool.kscpb.com` 網址即可。

## 網域設定（只需做一次）

`CNAME` 檔內容固定為 `tool.kscpb.com`，GitHub Pages 靠它判斷自訂網域。

DNS 在 Namecheap → Advanced DNS：

| Type | Host | Value | TTL |
|---|---|---|---|
| CNAME Record | `tool` | `elanhuang-sudo.github.io` | Automatic |

⚠️ Target 是 `elanhuang-sudo.github.io`，**不要**寫成 repo 名稱或加上路徑。
⚠️ Host 只填 `tool`，不要填 `tool.kscpb.com`（Namecheap 會自動接上網域）。

設定後到 GitHub repo → Settings → Pages 確認顯示 `tool.kscpb.com`，
並勾選 **Enforce HTTPS**（需等憑證簽發完成才勾）。

> ⚠️ **不要加 `*.kscpb.com` wildcard CNAME。** GitHub Pages 一個 repo 只認一個網域，
> wildcard 蓋不掉問題，反而會把 `status`／`pic`／`n8n` 等現有服務全導到 GitHub。

## 新增一個工具（不用碰 DNS）

1. 在專案根目錄建一個資料夾，例如 `overtime/`。
2. 把工具做成單一 `overtime/index.html`（CSS/JS 全部內嵌，無外部依賴）。
3. 打開根目錄的 `index.html`，找到 `<!-- 新增工具 -->` 註解下方，
   複製整段 `<a class="tool"> … </a>`，改 `href`、標題、說明、`<span class="path">` 與標籤。
   工具數量會自動更新。
4. `git add -A` → `git commit -m "新增加班費試算"` → `git push`。

網址就是 `https://tool.kscpb.com/overtime/`，**DNS 不用再動**。

---

# 工具一：勞健保三合一保費試算（`/labor-insurance/`）

- 適用年度：2026 年（民國 115 年），各表自 **115 年 1 月 1 日** 起適用
- 資料性質：全部取自政府公開資料，未轉載任何民間整理表
- 單檔免安裝：`labor-insurance/index.html` 可直接雙擊開啟，或傳給客戶

## 資料來源（官方）

| 項目 | 官方文件 | 機關 |
|---|---|---|
| 勞保級距 | [勞工保險投保薪資分級表](https://www.bli.gov.tw/0005475.html) | 勞動部勞工保險局 |
| 勞保費（含就保） | [勞工保險普通事故及就業保險合計之保險費分擔金額表](https://www.bli.gov.tw/0011588.html) | 勞動部勞工保險局 |
| 職災級距 | [勞工職業災害保險投保薪資分級表](https://www.bli.gov.tw/0106148.html) | 勞動部勞工保險局 |
| 勞退提繳 | [勞工退休金月提繳工資分級表](https://www.bli.gov.tw/0013083.html) | 勞動部勞工保險局 |
| 健保費 | [全民健康保險保險費負擔金額表（三）](https://www.nhi.gov.tw/ch/cp-19418-9eefb-2576-1.html) | 衛生福利部中央健康保險署 |
| 健保級距 | [全民健康保險投保金額分級表](https://www.nhi.gov.tw/ch/cp-19421-f9533-2569-1.html) | 衛生福利部中央健康保險署 |
| 墊償基金 | [積欠工資墊償基金提繳及墊償管理辦法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030005) | 全國法規資料庫（萬分之 2.5） |

## 功能

| 操作 | 結果 |
|---|---|
| 在「月薪資總額」輸入金額 | 自動對應投保級距（未達整級以較高級計算），即時顯示單位／員工應繳 |
| 從「或直接選擇投保級距」下拉 | 直接鎖定某一級（82 級全部列出） |
| 點下方「完整級距對照表」任一列 | 套用該級距並回到頁首 |
| 選「健保眷屬人數」 | 員工健保自付 ×(1+眷屬)，超過 3 人以 3 人計 |
| 勾「加入職業災害保險費」並填費率 | 以職災投保薪資（29,500～72,800）概估，計入單位負擔 |
| 「複製試算結果」 | 把級距、員工、單位、合計與明細複製成純文字（可直接貼 LINE） |
| 「列印／存 PDF」 | 輸出乾淨的 A4 版面 |

## 計算基礎

| 項目 | 費率 | 分擔 | 級距上下限 |
|---|---|---|---|
| 勞工保險（普通事故＋就業保險） | 11.5% ＋ 1% ＝ **12.5%** | 勞工 20%／雇主 70%／政府 10% | 11,100 ～ 45,800 |
| 全民健康保險 | **5.17%** | 勞工 30%／雇主 60%（雇主含平均眷口 0.56 人，合計 1.56 人）／政府 10% | 29,500 ～ 313,000 |
| 勞工退休金（新制） | **6%** | 雇主全額 | 1,500 ～ 150,000 |
| 積欠工資墊償基金 | **0.025%**（萬分之 2.5） | 雇主全額 | 按勞保投保薪資總額 |
| 職業災害保險 | 依行業別費率 | 雇主全額 | 29,500 ～ 72,800 |

金額一律以「月」（投保日數 30 日）計。勞保費**不含**職業災害保險（可由進階選項加計）。

## 數字驗證

`verify/` 內含官方原始資料快照與核對腳本：

```powershell
python verify\verify_official.py
```

腳本會把 `labor-insurance/index.html` 的 82 列，逐筆比對：

- **勞保**：與勞保局 ODS 分擔金額表比對 28 級（11,100～45,800）
- **健保**：與健保署負擔金額表比對 58 級（29,500～313,000）
- **勞退**：以 `min(max(工資,1500),150000) × 6%` 驗算 82 級
- **墊償**：以 `勞保投保薪資 × 0.025%` 四捨五入驗算 82 級
- **合計**：勞工＝勞保＋健保、單位＝勞保＋墊償＋健保＋勞退

最新結果見 `verify/report.txt`（目前 **0 錯誤**）。

快速檢查（不需官方快照檔）：

```powershell
node labor-insurance\_verify.js
```

## 更新資料（換年度時）

1. 打開 `labor-insurance/index.html`，找到 `var ROWS = [`。
2. 每列格式：
   `[級數, 投保級距, 勞保-勞工, 勞保-雇主, 墊償-雇主, 健保-勞工, 健保-雇主, 勞退-雇主, 合計-勞工, 合計-雇主, "備註"]`
   級數填 `0` 表示「低薪／部分工時級」（無級數編號）。
3. 存檔後執行 `node labor-insurance\_verify.js`。
4. 換年度時同步更新 `verify/` 內的官方快照，重跑 `python verify\verify_official.py`。
5. 更新頁尾費率、`<title>`、頁首年份，以及首頁的「115 年適用」標籤。

## 注意

- 本頁僅供試算參考，實際金額以勞保局、健保署核定為準。
- 到職或離職當月未足月：勞保按日計收、健保按月計收。
- 本表適用一般本國人、有一定雇主之受僱者；外籍人士、部分工時、職業工會、自營業主等另有規定。
