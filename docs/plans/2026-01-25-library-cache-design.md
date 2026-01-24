# 曲库持久化缓存（含分析结果与封面）设计方案

## 目标与范围
- 目标：刷新后立即恢复曲库完整信息（bpm、调性、能量、热度等）与封面，不再重新解析。
- 范围：曲库列表、分析结果、封面缓存；不缓存音频本体。
- 策略：**自动写入**、**永久保留**、**手动清除**。

## 方案概览
- **localStorage**：保存曲库主数据（轻量、可立即恢复）。
- **IndexedDB**：保存封面二进制（Blob），避免刷新丢失。
- **恢复逻辑**：先渲染 localStorage 中的曲库数据，再异步补齐封面。

## 数据模型
### Track 扩展字段
- `coverKey?: string | null`：封面在 IndexedDB 中的 key。
- `filePath?: string | null`：桌面端本地绝对路径（用于导出）。

### cache 数据结构（localStorage）
- `dj_library_cache_v1`
  - `library`: Track[]（包含分析结果与 coverKey）
  - `libraryOrder`: string[]（曲库顺序）

### IndexedDB
- DB: `dj_cache_v1`
- Store: `covers`
  - key: `coverKey`
  - value: `{ blob: Blob, updatedAt: number }`

## coverKey 生成规则
- 优先使用稳定文件签名：`file.name + size + lastModified`。
- 若缺失，退化为 `filePath`（桌面端可用）。

## 数据流
### 导入与分析
1) 读取本地文件 → 生成 Track 基础字段 → **立即写入 localStorage**。
2) 分析结果返回 → 更新 Track → **立即写入 localStorage**。
3) 封面提取完成 → 写入 IndexedDB，并更新 Track.coverKey → **立即写入 localStorage**。
4) UI：封面未到时显示占位图，封面写入后替换为真实图。

### 刷新恢复
1) 启动时读取 `dj_library_cache_v1` → 立刻渲染曲库与分析结果。
2) 异步批量读取 IndexedDB covers → 回填 `coverUrl`。
3) 若封面缺失：保持占位图，不触发重新解析。

## 清理策略
- 提供“清除缓存”按钮，同时清除：
  - localStorage `dj_library_cache_v1`
  - IndexedDB `dj_cache_v1/covers`

## 错误处理
- localStorage 读取失败：降级为空曲库。
- IndexedDB 读取失败：仅封面缺失，其他字段不受影响。
- 任何缓存异常不得阻塞 UI 渲染。

## 测试与验证
- 单元测试：coverKey 生成的稳定性与一致性。
- 缓存恢复测试：刷新后曲库字段完整、封面异步补齐。
- 手动验证：导入 → 刷新 → 数据与封面仍在。

## 风险与注意事项
- 缓存永久保留需明确“手动清除”入口。
- 生成 `coverUrl` 后需在移除/清理时 `URL.revokeObjectURL`，避免内存泄漏。
