# NCM 详情字段抽样审计设计

**目标**
- 基于 `data/heat_samples.json` 抽样 20 条 `detail_ok=1` 的样本（或按 match_score 前 20）。
- 对每条调用 `NeteaseEnhancedClient.fetch_track_detail_with_meta(track_id)`，导出字段快照。
- 输出 CSV：`out/ncm_detail_field_snapshot.csv`。
- 控制台打印 popularity=100 的占比（抽样 + 全量）。

**抽样策略**
- 默认随机抽样（可加 `--seed` 便于复现）。
- 可选：`--mode top-score` 取 match_score 前 20。

**输出字段（至少）**
- track_id, name
- popularity, popularity_source
- comment_count, comment_source
- publish_time
- raw_source
- 额外探测：playCount/score/likedCount/shareCount（如果 detail 里存在）
- detail_ok / detail_error_reason（若失败）

**数据来源**
- `fetch_track_detail_with_meta` 返回的 `detail` 原始 dict 用于探测字段。
- popularity=100 占比：
  - 抽样：以本次 fetch 结果为准
  - 全量：基于 `heat_samples.json` 中已有 popularity 统计（不再二次请求）

**约束**
- 不改评分逻辑。
- 仅做字段探测与导出。
