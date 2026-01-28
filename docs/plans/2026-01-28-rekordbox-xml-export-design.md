# Rekordbox 固定 XML（ZOKEN SETGPT）设计

> **目标**：导出时始终更新同一个 `ZOKEN SETGPT.xml`，避免用户每次重新导入新的 XML；并在 Rekordbox 中保留历史导出的多个 set。

## 需求确认
- 只生成一个固定 XML 文件：`ZOKEN SETGPT.xml`
- 每次导出：
  - **追加**一个新的 playlist（保留历史 set）
  - **不覆盖**原有 playlist
  - 若 set 名称重复，**自动重命名**（如 `Set Name (2)`）
- COLLECTION 需要**去重追加**（同一文件路径只保留一个 TrackID）
- XML 仍能被 Rekordbox 正确解析与加载

## 方案概述
- 导出流程改为：
  1) 读取现有固定 XML（若不存在则新建基础结构）
  2) 合并/去重 COLLECTION：以 `Location` 为唯一键
  3) 追加新的 `<NODE Type="1" Name="...">` 到 `DJ-ZOKEN` 下
  4) 写回同一个 XML 文件路径

## 文件路径
- 固定输出：
  `~/Documents/DJ-ZOKEN/Exports/rekordbox/ZOKEN SETGPT.xml`

## 去重策略
- 唯一键：`Location`
- 若已存在，复用旧 TrackID
- 若不存在，新建 TrackID（最大 TrackID + 1）

## 重名策略
- 若 playlist 名称已存在：
  - 新名称：`{原名} (2)`、`(3)`...

## 错误处理
- XML 解析失败：
  - 旧文件备份为 `.bak`
  - 重新生成基础 XML 并写入
- 缺失 filePath：
  - 该曲目跳过导出，并在前端提示

## 兼容性说明
- `Location` 使用 `file://localhost` + 原始 UTF-8 路径
- XML 进行必要的 `&` 转义


## UI 提示调整
- 提示用户：Rekordbox XML 需要 Collection 作为底层索引，但实际编排/查看请在 Playlist 中操作
- 导出界面不再强调“全曲库”，避免误解

