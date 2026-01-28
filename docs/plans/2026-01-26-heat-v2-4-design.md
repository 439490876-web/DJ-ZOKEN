# 热度 v2.4（pop+comment）最小改动设计

**目标**
- 仅在 `pop_comment_v2` 分支内升级为 v2.4 公式（只用 popularity + comment_count）。
- 不引入榜单/热评/歌单等额外信号。
- 保持 `club_boost += 0.35`、`HEAT_K=25`、新歌 floor 逻辑不变。
- breakdown 输出新增 `pop_term/cmt_term/pop_top/raw/heat_10`。
- 环境变量新增默认值，并同步到 `.env.example`。

**核心公式（v2.4）**
- pop_norm = clamp((pop - pop_baseline) / (100 - pop_baseline), 0, 1)
- pop_base = pop_norm ** POP_GAMMA
- top_zone = clamp((pop - POP_TOP_START) / (100 - POP_TOP_START), 0, 1)
- pop_top  = POP_TOP_BOOST * (top_zone ** 2)
- pop_term = pop_base + pop_top

- cmt_norm = log1p(comment) / log1p(COMMENT_REF)
- cmt_norm = clamp(cmt_norm, 0, 1.2)
- cmt_term = cmt_norm ** COMMENT_GAMMA

- lifetime_raw = POP_WEIGHT * pop_term + CMT_WEIGHT * cmt_term
- raw = lifetime_raw * RAW_SCALE
- heat_10 = 1 + 9 * raw / (raw + HEAT_K)

**新增环境变量（默认值）**
- POP_GAMMA=1.6
- POP_TOP_START=95
- POP_TOP_BOOST=0.35
- COMMENT_REF=50000
- COMMENT_GAMMA=1.15
- POP_WEIGHT=0.60
- CMT_WEIGHT=0.40
- RAW_SCALE=8.0

**改动范围**
- `apps/backend/PyLyrics-Extractor/app/services/scoring.py`
  - 仅 pop_comment_v2 分支替换公式。
  - 保留 club_boost 与新歌 floor 逻辑。
  - breakdown 中新增字段。
- `apps/backend/PyLyrics-Extractor/.env.example`
  - 添加上述环境变量及说明。

**验证**
- 单元测试：新增测试覆盖 pop_term/cmt_term/pop_top/raw/heat_10 计算。
- 回归审计：`python scripts/audit_heat_v2.py --input data/heat_samples.json`
  - 输出热度分布与 7 桶占比变化。
