# Heat Auto Verify Design

**目标**
当开发栈启动/重启时，自动清理 PyLyrics-Extractor 缓存并验证热度模型（必须是 v4-popcomment），避免前端继续命中旧缓存或旧服务。

**方案（选项 1：接入 dev-stack-runner）**
在 dev-stack-runner 的 `start_stack.sh` 末尾加入“热度校验”步骤，调用仓库内脚本 `scripts/verify_heat_backend.py`：
- 清理 `apps/backend/PyLyrics-Extractor/app/data.db` 中 `cache` 表
- 如 8002 未启动则启动；已启动则重启
- 调用 `/identify?debug=true`，检查 `evidence.heat_source == v4-popcomment`
- 若校验失败，打印清晰原因并返回非 0（可选）

**关键点**
- 脚本只在 start_stack 时执行，避免每次前端热更新都重启后端
- 识别不到 sample 文件时降级只做 `/ping` 和端口检查
- 校验逻辑有单测（只测脚本逻辑，不发真实请求）

是否可行？如果你确认，我将写入实施计划并按计划执行。
