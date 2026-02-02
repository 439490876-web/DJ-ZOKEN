# SetGPT 中间栏 Stitch 重绘设计方案

**目标与范围**
- 目标：中间栏 UI 100% 对齐 `/Users/apple/Downloads/stitch_setgpt_desktop_ui_redesign_variant_1` 的视觉与布局，同时嵌入原有“命名 Set / 新建 Set / 保存 Set / Set 库”功能，以及底部“重置 / 导出 / 保存”功能。
- 范围：仅中间栏（顶部区、阶段卡、空态、底部条）；不改业务逻辑、数据流、事件与快捷键。

**布局与视觉映射**
- 顶部采用 Stitch 的标题块结构（标题+统计+严格度切换+主按钮），其下新增一条“Set 控制条”，与标题块同材质同风格。
- Set 控制条内嵌：Set 名称输入框、【新建 Set】、【保存 Set】、【Set 库】入口（下拉/折叠卡片样式，仍处于中间栏顶部区域）。
- 中部三阶段卡（Warm‑up/Prime Time/Closing）与大空态容器完全按 Stitch 视觉重绘；文案不变。
- 底部条严格使用 Stitch 底栏样式，但承载【重置/导出/保存】三按钮（按用户选项 A，不显示 Undo/Redo）。

**交互与数据绑定（不改逻辑）**
- Set 名称输入：绑定 `currentSetName`；仍由 `saveSet` 处理保存时机。
- 新建 Set：调用 `handleNewSet`。
- 保存 Set：调用 `saveSet`。
- Set 库：展示 `SavedSetLibrary` 数据与操作，仍使用 `onLoadSet/onRenameSet/onDeleteSet`。
- 严格度切换、阶段卡切换、空态提示、底部按钮等均复用现有事件与状态。

**实现路径（文件级）**
- 修改中间栏布局：`apps/frontend/DJ-ZOKEN/App.tsx`
- 必要的 UI primitive 复用：`apps/frontend/DJ-ZOKEN/components/ui/*`
- 不调整业务层与服务层。

**测试与验收**
- 运行 `cd apps/frontend/DJ-ZOKEN && npm test`
- 关键行为验收：
  - Set 名称可编辑并可保存/覆盖
  - 新建 Set 逻辑不变
  - Set 库加载/重命名/删除不变
  - 底部重置/导出/保存行为不变
  - 拖拽、快捷键、AI 分析按钮行为不变

**风险点与回滚**
- 风险：中间栏结构重排可能影响 flex 高度/溢出滚动。
- 回滚：仅回退 `App.tsx` 中间栏 JSX 区块与相关样式类；不影响业务逻辑。
