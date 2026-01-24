# Set 一键导出到 Serato / Rekordbox（桌面版）设计方案

## 目标与范围
- 目标：为当前编排 Set（桌面版）提供一键导出能力，用户可选择导出到 Serato 或 Rekordbox。
- 必须即时可见：导出完成后在 Serato / Rekordbox 内**立刻出现**新建的文件夹/播放列表，无需手动导入或重启。
- 平台：**macOS 优先**。
- 交互：导出目标可选（Serato 或 Rekordbox）；导出对象当前仅支持“当前编排”。
- 数据：仅导出**本地绝对路径**，不包含附加字段。

## 架构与数据流
- 采用 **Electron** 作为桌面容器（主进程 + 渲染进程）。
- 渲染进程保留现有 Vite 前端逻辑：曲库、Set 编排、已保存 Set 管理。
- 拖入本地文件时，通过 Electron 接口获取**真实绝对路径**并写入 Track 的 `filePath` 字段，同时进入缓存。
- 导出流程：
  1) 渲染进程收集目标 Set 的 `filePath[]`。
  2) 通过 IPC 调用主进程导出适配器。
  3) 主进程写入 Serato / Rekordbox 数据库，实现即时出现。

## UI / 交互设计
- 在 Set 编排区新增“导出”入口（靠近“保存 Setlist”按钮）。
- 导出弹窗字段：
  - 导出目标：Serato / Rekordbox（单选）
  - 导出对象：当前编排（锁定）
  - 导出位置：由桌面端环境变量指定（`SERATO_DIR` / `REKORDBOX_DB_PATH`）
- 预校验：
  - 若 Set 中存在缺少 `filePath` 的歌曲，提示缺失数量。
- 完成提示：显示“导出已提交”或失败原因。

## 即时出现实现（数据库写入）
### Serato
- 定位：通过 `SERATO_DIR` 指定（通常为 `~/Music/_Serato_`）。
- 写入策略：生成/更新 `.crate` 文件，对应 Set 名称。
- 即时可见策略：
  - 生成 `Subcrates/<Set>.crate`。
  - 若数据库文件为文本格式，追加 `CRATE: <Set>` 记录；若检测为二进制则仅写 crate。
- 写入前备份：当前实现会将 `database` / `database V2` 备份到 `backup/` 目录。

### Rekordbox
- 定位：通过 `REKORDBOX_DB_PATH` 指定 `master.db`（SQLite）。
- 事务写入（当前最小表结构）：
  - `tracks(path)`、`playlists(name)`、`playlist_tracks(playlist_id, track_id)`。
- 备注：实际 Rekordbox 数据库结构需按版本适配；当前实现为最小可用原型。

## 风险与回滚
- 风险：数据库结构随版本变更；写入失败可能损坏用户库。
- 控制：
  - Serato：自动备份 `database` / `database V2`。
  - Rekordbox：建议导出前手动备份 `master.db`（当前实现未自动备份）。
  - 失败时给出明确错误提示（路径未配置、权限不足、结构不兼容等）。

## 测试策略
- 集成测试：准备包含多首歌的 Set，验证导出后 Serato / Rekordbox 立刻出现新列表。
- 回滚测试：模拟写入失败，验证备份恢复可用。
- 兼容性测试：至少覆盖 1–2 个主流版本（macOS）。

## 约束与假设
- 用户允许应用访问本地文件系统与数据库文件。
- 本功能仅面向桌面版；Web 版不支持绝对路径即时导出。
