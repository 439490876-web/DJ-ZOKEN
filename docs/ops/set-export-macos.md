# Set 一键导出（macOS）使用说明

## 目标与适用范围
- 目标：将“当前编排”的 Set 一键导出到 Serato 或 Rekordbox，并立即在软件中出现。
- 适用范围：桌面版（Electron），macOS。

## 前置条件
- 已在桌面端导入本地歌曲，且曲库 Track 已包含 `filePath`。
- Serato 或 Rekordbox 已安装。

## 环境变量配置
在启动桌面端前配置以下变量（示例：`~/.zshrc`）：

```bash
export SERATO_DIR="$HOME/Music/_Serato_"
export REKORDBOX_DB_PATH="$HOME/Library/Pioneer/rekordbox/master.db"
```

> 若路径不同，请按实际路径修改。

## 导出步骤
1. 在前端完成“当前编排”。
2. 点击底部“导出”按钮。
3. 选择导出目标（Serato / Rekordbox）。
4. 点击“确认导出”。
5. 成功后无需重启软件，目标软件内应立即出现新的 crate / playlist。

## 即时可见策略（当前实现）
### Serato
- 生成 `SERATO_DIR/Subcrates/<Set 名称>.crate`。
- 若数据库文件为文本格式，追加 `CRATE: <Set 名称>` 记录；若为二进制则仅写 crate。
- 自动备份：`SERATO_DIR/backup/database.bak` 与 `database V2.bak`。

### Rekordbox
- 直接写入 `REKORDBOX_DB_PATH` 指向的 SQLite。
- 当前实现使用最小表结构（`tracks` / `playlists` / `playlist_tracks`），实际版本可能需要适配。
- **建议导出前手动备份 `master.db`**。

## 失败处理与回滚
- Serato：可用 `SERATO_DIR/backup/` 下的 `.bak` 文件覆盖恢复。
- Rekordbox：使用手动备份恢复。

## 常见问题
- 提示 “Missing SERATO_DIR / REKORDBOX_DB_PATH”
  - 检查环境变量是否已设置并在启动应用前生效。
- 导出后未出现
  - 确认 `filePath` 不为空；
  - Serato/Rekordbox 是否使用相同的库目录；
  - Rekordbox 可能需要匹配真实的表结构（后续适配）。
