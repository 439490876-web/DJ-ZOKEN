# audit_heat_v2 顶部 Top20 细分输出设计

**目标**
- 在 `audit_heat_v2.py` 输出目录新增 `out/top20_breakdown.csv`。
- 按 `heat_score_raw` 降序取前 20（样本不足 20 则输出全量）。
- 每行输出：
  - track_id, name, popularity, comment_count
  - pop_term, cmt_term, pop_top, raw, heat_10, heat_score_raw
- 控制台打印：`max(raw) / p95(raw) / median(raw)`，并提示是否 `raw <= 60`。

**公式一致性**
- audit 中间量需与 v2.4 公式一致：pop_term/cmt_term/pop_top/raw/heat_10。
- momentum 不影响 raw（仅保留参考输出），raw 由 lifetime_raw + club_boost 再乘 RAW_SCALE。

**输出位置**
- `out/top20_breakdown.csv`

**兼容性**
- 保留原有 `heat_audit_rows.csv` 与 summary 输出。
