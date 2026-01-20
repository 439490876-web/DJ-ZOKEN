# Skill: dev-stack-runner

## 用途
用于管理 NEWSETki 的开发环境栈：启动/停止/查看状态/追踪日志。

## 输出语言规则
- 所有说明、步骤、结论默认使用**简体中文**。
- 命令/代码/路径/日志内容保持原样不翻译。
- 若用户明确要求英文，则按用户要求。

## 适用场景（触发）
当用户提出以下请求时应使用本 skill：
- 启动/停止/重启 NEWSETki 开发环境
- 查看服务状态（端口是否占用、进程是否存活）
- 查看/追踪日志（tail logs）
- 排查“跑不起来/端口冲突/无响应”等启动问题

## 文件与路径（以本机为准）
本 skill 位于：~/.codex/skills/dev-stack-runner/
通常包含：
- scripts/start_stack.sh
- scripts/stop_stack.sh
- scripts/status_stack.sh
- scripts/tail_logs.sh
- references/stack.md（端口与路径说明）

## 使用方法
优先使用脚本（不要手动重复造轮子）：
- 启动：bash ~/.codex/skills/dev-stack-runner/scripts/start_stack.sh
- 停止：bash ~/.codex/skills/dev-stack-runner/scripts/stop_stack.sh
- 状态：bash ~/.codex/skills/dev-stack-runner/scripts/status_stack.sh
- 日志：bash ~/.codex/skills/dev-stack-runner/scripts/tail_logs.sh

## 约束（安全）
- 不要误杀无关进程；停止操作应尽量只停止本栈相关服务。
- 不要删除项目文件。
- 如果路径/端口与实际不一致，应先读取 references/stack.md 并按其说明修正脚本或提示用户修正。
