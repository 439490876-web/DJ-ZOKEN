# 导出对象可选（当前编排 + 已保存 Set）设计说明

## 目标与范围
- 让“导出对象”真正可交互：支持 **当前编排** 与 **已保存 Set** 之间切换。
- 导出内容与 UI 一致：选择哪一类对象，就导出对应的曲目。
- 保持导出目标（Serato/Rekordbox）逻辑不变，不改后端接口协议。

## 交互与数据流
- 对话框默认选中“当前编排”。
- 当选择“已保存 Set”时，显示二级选择（下拉列表），列出 set 名称 + 歌曲数 + 时长。
- 选择 set 后：
  - 导出曲目源切换为该 set 的 `tracks`。
  - `setName` 自动同步为该 set 名称（可手动修改）。
- 缺失文件路径按当前导出对象动态统计并提示，不阻断导出。

## 状态与逻辑
- 新增状态：
  - `sourceType: 'current' | 'saved'`
  - `selectedSetId?: string`
- 计算：
  - `activeTracks = sourceType === 'current' ? currentSetTracks : selectedSet.tracks`
  - `filePaths = activeTracks.map(resolveFilePath)`
  - `payload = buildExportPayload(target, setName, filePaths)`
- `确认导出` 按钮启用条件：
  - Electron 可用 + 非提交中 + `setName` 非空 + `activeTracks` 非空
  - 若 `sourceType === 'saved'`，必须已选中 `selectedSetId`

## 失败与提示策略
- 未选择已保存 Set：显示“请先选择要导出的 Set”，禁用确认按钮。
- 导出对象为空：显示“当前导出对象为空，无法导出”，禁用确认按钮。
- Electron 不可用：保留现有提示与错误信息。

## 验证要点
1) 当前编排导出：能成功触发导出。
2) 已保存 Set 导出：选择 set 后可导出指定 set。
3) 导出对象为空时不可导出。
4) 未选择已保存 Set 时不可导出。
