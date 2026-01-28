# 从音频目录构建热度审计样本设计

**目标**
- 从本地音频目录生成可用于热度审计的 `data/heat_samples.json`，并导出人工复核 CSV。
- 复用现有标题清洗策略（`apps/backend/PyLyrics-Extractor/app/services/cleaning.py`）。
- 通过本地 ncm-api（`127.0.0.1:3001`）搜索拿到**真实网易云数字 track_id**。
- 生成后自动运行审计脚本（含 repeat-fetch 抖动检测）。

**输入**
- 音频目录：`/Users/apple/work/112teset`（支持 mp3/m4a/flac/wav/aiff）。
- 元数据来源：优先读取 tags（title/artist/album/duration），缺失时回退到文件名。
- 标题清洗：必须使用 `cleaning.clean_track()`，并采用其 `clean_title/clean_artist/query_title/query_artist`。

**搜索与匹配**
- Query 规则：`"{cleaned_artist} {cleaned_title}"`，若 artist 缺失则仅 title。
- 搜索接口：`GET http://127.0.0.1:3001/search?keywords=...&limit=5&type=1`。
- 候选评分（0~100）：
  - 标题相似度（权重最高）：使用 `cleaning.normalize_similarity_text` + difflib ratio 或 token overlap。
  - 艺人相似度（权重次之）：同上。
  - 时长接近：双方都有时长且误差 <3s 加分；>10s 扣分。
- 选择最高分候选；`match_score < 70` 或无结果 → unmatched。
- track_id 必须为纯数字，否则视为未匹配。

**输出**
1) `data/heat_samples.json`
   - `track_id`（数字）
   - `name`（artist - title）
   - `query`
   - `match_score`
   - `matched_name / matched_artist / matched_duration`
   - `source="ncm_search"`
   - `audio_path`

2) `out/heat_samples_review.csv`
   - 基础字段：`audio_path, raw_title, raw_artist, cleaned_title, cleaned_artist, query, chosen_track_id, match_score`
   - Top5 候选展开列：每个候选单独展开 `id/name/artist/duration/score`（例如 `cand1_id, cand1_name, cand1_artist, cand1_duration, cand1_score` ... `cand5_...`）

3) `out/heat_samples_unmatched.csv`
   - `match_score < 70` 或无结果的记录

**容错与提示**
- mutagen 缺失：提示 `pip install mutagen`，不崩溃；可选择退出。
- ncm-api 不可用：记录 error_reason，写入 unmatched，避免中断全流程。

**审计验证**
- 运行：
  - `python scripts/audit_heat_v2.py --input data/heat_samples.json`
  - `python scripts/audit_heat_v2.py --input data/heat_samples.json --repeat-fetch 3 --limit 20`
- 输出摘要：heat_score 分布、7 分桶/RAW 桶占比、repeat-fetch 失败原因 Top3。
