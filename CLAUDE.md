# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 构建命令

```bash
# 开发模式
npm run tauri dev

# 生产构建
npm run tauri build
```

## Lint 命令

```bash
# 前端
npm run lint          # ESLint 检查
npm run lint:fix      # 自动修复 ESLint 问题
npm run format        # Prettier 格式化

# Rust (在 src-tauri/ 目录下执行)
cargo fmt             # 格式化代码
cargo clippy          # Lint 检查
```

## 架构

这是一个基于 Tauri 2.0 的桌面应用，用于查看 AI Agent 的 JSONL 格式对话日志。

### 前端 (React + TypeScript)

- `src/components/AppShell/`: 主布局，包含侧边栏和内容区
- `src/components/ChatMessage/`: 单条消息渲染，包含头像、时间戳、内容
- `src/components/ToolExpander/`: 工具调用/结果的折叠展示
- `src/hooks/useJsonlParser.ts`: 核心解析逻辑，将 JSONL 转换为 ParsedMessage
- `src/hooks/useFileList.ts`: 通过 Tauri invoke 扫描目录
- `src/types/message.ts`: 所有消息类型的 TypeScript 接口定义

### 后端 (Rust)

- `src-tauri/src/commands/file_ops.rs`: Tauri 命令 `scan_directory` 和 `read_jsonl_file`
- 两个命令都通过 `expand_tilde()` 函数支持 `~` 路径展开

### JSONL 格式兼容

支持多种 AI Agent 日志格式：OpenAI (`tool_calls` + `function`)、Claude (`tool_use` + `input`)、Anthropic (`toolCall` + `arguments`)。详见 `src/types/message.ts` 中的 ContentItem 联合类型。

## 重要说明

- 默认扫描路径: `~/.openclaw/agents/main/sessions`
- `~` 路径展开在 Rust 中使用 `dirs` crate 实现
- 文件列表按修改时间降序排序

## 代码风格

- **禁止兼容旧格式**：如果改动会破坏现有接口或数据结构，不要尝试保留旧字段或添加兼容分支逻辑。此时必须提示用户确认改动方案。

## Python 版本

`streamlit/jsonl_viewer.py` 是早期的 Streamlit 实现，**已不再维护**，仅作为参考保留。除非用户明确要求修改 Python 代码，否则不要尝试修改或优化 Python 版本。