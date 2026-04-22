import streamlit as st
import json
import os
from datetime import datetime, timezone, timedelta

# 页面配置：宽屏模式，方便查看长文本
st.set_page_config(page_title="Agent Log Viewer", layout="wide", page_icon="🤖")

# 自定义 CSS，让对话气泡更好看
st.markdown("""
<style>
    .stChatMessage {
        padding: 10px;
        border-radius: 10px;
        margin-bottom: 10px;
    }
    /* 代码块样式优化 - 浅色背景深色字 */
    pre {
        background-color: #f5f5f5 !important;
        color: #333 !important;
        padding: 10px;
        border-radius: 5px;
        border: 1px solid #ddd;
    }
    pre code {
        color: #333 !important;
        background-color: transparent !important;
    }
    /* 行内代码样式 */
    code {
        background-color: #f0f0f0 !important;
        color: #d63384 !important;
        padding: 2px 4px;
        border-radius: 3px;
    }
    /* radio 按钮标签单行显示，自适应宽度 */
    .stRadio label {
        white-space: nowrap;
    }
    /* 显示原文按钮样式 - 小巧 */
    .stChatMessage .stButton button {
        font-size: 11px !important;
        padding: 0px 4px !important;
        height: 22px !important;
        min-height: 22px !important;
        line-height: 1 !important;
        border-radius: 4px !important;
    }
    /* 让头部行紧凑 */
    .stChatMessage [data-testid="stHorizontalBlock"] {
        gap: 0 !important;
        align-items: center !important;
    }
    .stChatMessage [data-testid="stHorizontalBlock"] > div {
        padding: 0 !important;
    }
    .stChatMessage [data-testid="stHorizontalBlock"] > div:first-child > div {
        display: flex;
        align-items: center;
    }
</style>
""", unsafe_allow_html=True)

st.title("🤖 AI Agent 对话日志查看器")

# --- 侧边栏：文件选择逻辑 ---
st.sidebar.header("📂 文件选择")

# 方式一：输入本地文件夹路径
folder_path = st.sidebar.text_input("输入本地文件夹路径（按回车确认）", value="~/.openclaw/agents/main/sessions")

# 展开 ~ 为用户主目录
expanded_folder_path = os.path.expanduser(folder_path) if folder_path else ""

# 方式二：上传文件（不限制后缀）
uploaded_files = st.sidebar.file_uploader(
    "或上传文件",
    accept_multiple_files=True
)

# 收集所有文件选项
file_options = {}

# 从上传的文件中提取
if uploaded_files:
    for f in uploaded_files:
        file_options[f.name] = {"type": "uploaded", "file": f}

# 从本地文件夹中扫描
if expanded_folder_path and os.path.isdir(expanded_folder_path):
    file_list = []
    for filename in os.listdir(expanded_folder_path):
        filepath = os.path.join(expanded_folder_path, filename)
        if os.path.isfile(filepath):
            mtime = os.path.getmtime(filepath)
            file_list.append((filename, {"type": "local", "path": filepath, "mtime": mtime}))
    # 按修改时间降序排序（最新的在前）
    file_list.sort(key=lambda x: x[1]["mtime"], reverse=True)
    for filename, info in file_list:
        file_options[filename] = info
elif expanded_folder_path and not os.path.isdir(expanded_folder_path):
    st.sidebar.warning(f"路径不存在或不是文件夹: {folder_path}")

# --- 主界面：解析与展示逻辑 ---
if not file_options:
    st.info("👈 请在左侧输入有效的文件夹路径或上传文件。")
else:
    # 显示文件数量
    st.sidebar.caption(f"共 {len(file_options)} 个文件")

    # 用 radio 选择文件，单行显示
    selected_filename = st.sidebar.radio(
        "选择文件",
        options=list(file_options.keys()),
        label_visibility="collapsed"
    )

    file_info = file_options[selected_filename]

    # 使用容器显示加载状态
    with st.spinner(f"正在加载 {selected_filename}..."):
        messages = []

        # 根据文件类型读取内容
        if file_info["type"] == "uploaded":
            lines = file_info["file"].getvalue().decode("utf-8").splitlines()
        else:
            with open(file_info["path"], "r", encoding="utf-8") as f:
                lines = f.readlines()

        parse_errors = 0
        for line in lines:
            line = line.strip()
            if not line: continue
            try:
                data = json.loads(line)
                messages.append(data)
            except json.JSONDecodeError:
                parse_errors += 1
                continue

        # 如果有解析错误，在顶部提示
        if parse_errors > 0:
            st.sidebar.warning(f"⚠️ 有 {parse_errors} 行数据解析失败，已跳过。")

        # 建立 toolCallId -> 工具调用信息的映射
        tool_call_map = {}
        for msg in messages:
            msg_type = msg.get("type", "")
            # 跳过非消息类型（但需要保留 toolResult 来提取 tool_use_id 映射）
            if msg_type not in ("message", "user", "assistant", "system", "tool", "toolResult"):
                continue

            # 消息内容统一在 message 字段里
            inner_msg = msg.get("message", {})

            # 处理 message 级别的 tool_calls
            for tc in inner_msg.get("tool_calls", []):
                tc_id = tc.get("id", "")
                if tc_id:
                    func = tc.get("function", {})
                    tool_call_map[tc_id] = {
                        "name": func.get("name", "unknown") if func else "unknown",
                        "arguments": func.get("arguments", "{}") if func else "{}"
                    }
            # 处理 content 数组里的 toolCall 或 tool_use
            content_raw = inner_msg.get("content", [])
            if isinstance(content_raw, list):
                for item in content_raw:
                    if isinstance(item, dict):
                        item_type = item.get("type", "")
                        if item_type in ("toolCall", "tool_use"):
                            tc_id = item.get("id", "")
                            if tc_id:
                                tool_call_map[tc_id] = {
                                    "name": item.get("name", "unknown"),
                                    "arguments": item.get("arguments", item.get("input", {}))
                                }

        # --- 渲染对话流 ---
        for i, msg in enumerate(messages):
            msg_type = msg.get("type", "unknown")

            # 跳过非消息类型的记录（如 file-history-snapshot）
            if msg_type not in ("message", "user", "assistant", "system", "tool", "toolResult"):
                continue

            # 处理 type: "system" 的元数据消息（如 turn_duration）
            if msg_type == "system":
                subtype = msg.get("subtype", "")
                if subtype == "turn_duration":
                    duration_ms = msg.get("durationMs", 0)
                    message_count = msg.get("messageCount", 0)
                    # 显示为小字
                    st.caption(f"⏱️ 会话时长: {duration_ms/1000:.1f}s | 消息数: {message_count}")
                continue

            # 消息内容统一在 message 字段里
            inner_msg = msg.get("message", {})
            role = inner_msg.get("role", "unknown")
            content_raw = inner_msg.get("content", [])
            timestamp = msg.get("timestamp", "")
            tool_calls = inner_msg.get("tool_calls", [])
            name = inner_msg.get("name", "")

            # 解析 content 数组
            content = ""
            thinking_content = ""
            tool_calls_in_content = []
            tool_results = []  # 工具执行结果
            if isinstance(content_raw, str):
                content = content_raw
            elif isinstance(content_raw, list):
                text_parts = []
                for item in content_raw:
                    if isinstance(item, dict):
                        item_type = item.get("type", "")
                        if item_type == "text":
                            text_parts.append(item.get("text", ""))
                        elif item_type == "thinking":
                            # 思考内容单独存储
                            thinking_content = item.get("thinking", "")
                        elif item_type in ("toolCall", "tool_use"):
                            # 工具调用（支持两种格式）
                            tool_calls_in_content.append(item)
                        elif item_type == "tool_result":
                            # 工具执行结果
                            tool_results.append(item)
                        elif item_type == "image_url":
                            text_parts.append(f"[Image: {item.get('image_url', {}).get('url', 'unknown')}]")
                content = "\n".join(text_parts)

            # 如果有 tool_result，把它当作工具结果消息处理
            if tool_results:
                role = "toolResult"

            # 确定头像和颜色逻辑
            if role == "user":
                avatar = "👤"
                name_display = "User"
            elif role == "assistant":
                avatar = "🤖"
                name_display = name if name else "Assistant"
            elif role == "system":
                avatar = "⚙️"
                name_display = "System"
            elif role == "tool" or role == "toolResult":
                avatar = "🛠️"
                # 尝试从 tool_results 获取工具名称
                if tool_results:
                    first_tr = tool_results[0]
                    tool_use_id = first_tr.get("tool_use_id", "")
                    tool_info = tool_call_map.get(tool_use_id, {})
                    name_display = tool_info.get("name", "Tool Output")
                else:
                    name_display = inner_msg.get("toolName", name if name else "Tool Output")
            else:
                avatar = "❓"
                name_display = role

            # 使用 Streamlit 原生的聊天消息组件
            with st.chat_message(role, avatar=avatar):
                # 显示原文按钮状态
                msg_id = msg.get("id", str(i))
                state_key = f"show_raw_{msg_id}"
                if state_key not in st.session_state:
                    st.session_state[state_key] = False

                # 头部信息：名称 时间 按钮（紧凑排列）
                time_str = ""
                if timestamp:
                    try:
                        if isinstance(timestamp, str) and "T" in timestamp:
                            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                            dt_local = dt.astimezone(timezone(timedelta(hours=8)))
                            time_str = dt_local.strftime("%Y-%m-%d %H:%M:%S")
                        else:
                            time_str = str(timestamp)
                    except:
                        time_str = str(timestamp)

                # 按钮
                btn_label = "可视化" if st.session_state[state_key] else "显示原文"

                # 用列布局：名称时间 | 按钮
                col1, col2 = st.columns([8, 1])
                with col1:
                    st.markdown(f"**{name_display}** `{time_str}`")
                with col2:
                    if st.button(btn_label, key=f"btn_{msg_id}"):
                        st.session_state[state_key] = not st.session_state[state_key]
                        st.rerun()
                show_raw = st.session_state[state_key]

                # 显示原文或可视化内容
                if show_raw:
                    st.text(json.dumps(msg, ensure_ascii=False, indent=2))
                else:
                    # 主要内容区域
                    # 0. 思考内容，折叠显示
                    if thinking_content:
                        with st.expander("💭 思考过程", expanded=False):
                            st.markdown(thinking_content)

                    # 1. 如果有工具执行结果 (tool_results)
                    if tool_results:
                        for tr in tool_results:
                            tool_use_id = tr.get("tool_use_id", "")
                            tool_info = tool_call_map.get(tool_use_id, {})
                            tool_name = tool_info.get("name", "unknown")
                            tool_args = tool_info.get("arguments", {})
                            result_content = tr.get("content", "")

                            # content 可能是字符串，也可能是数组 [{"type":"text","text":"..."}]
                            if isinstance(result_content, list):
                                text_parts = []
                                for item in result_content:
                                    if isinstance(item, dict) and item.get("type") == "text":
                                        text_parts.append(item.get("text", ""))
                                result_content = "\n".join(text_parts)

                            # 折叠框标题显示工具名和参数
                            args_str = tool_args if isinstance(tool_args, str) else json.dumps(tool_args, ensure_ascii=False)
                            expander_title = f"📤 {tool_name}: {args_str}"

                            with st.expander(expander_title, expanded=False):
                                if result_content:
                                    # 确保 result_content 是字符串
                                    if not isinstance(result_content, str):
                                        result_content = str(result_content)
                                    stripped = result_content.strip()
                                    if stripped.startswith('{') or stripped.startswith('['):
                                        try:
                                            json_content = json.loads(result_content)
                                            formatted = json.dumps(json_content, ensure_ascii=False, indent=2)
                                            st.text(formatted)
                                        except:
                                            st.markdown(result_content)
                                    else:
                                        st.markdown(result_content)
                                else:
                                    st.text("(空结果)")

                    # 2. 如果有文本内容
                    if content:
                        # toolResult 角色，内容放在折叠框里
                        if role == "toolResult":
                            tool_call_id = inner_msg.get("toolCallId", "")
                            tool_info = tool_call_map.get(tool_call_id, {})
                            tool_name = tool_info.get("name", inner_msg.get("toolName", "unknown"))
                            tool_args = tool_info.get("arguments", {})

                            # 折叠框标题显示工具名和参数
                            args_str = tool_args if isinstance(tool_args, str) else json.dumps(tool_args, ensure_ascii=False)
                            expander_title = f"📤 {tool_name}: {args_str}"

                            with st.expander(expander_title, expanded=False):
                                # 判断内容类型：如果是 JSON 则格式化，否则用 markdown 渲染
                                stripped = content.strip()
                                if stripped.startswith('{') or stripped.startswith('['):
                                    try:
                                        json_content = json.loads(content)
                                        formatted = json.dumps(json_content, ensure_ascii=False, indent=2)
                                        st.text(formatted)
                                    except:
                                        st.markdown(content)
                                else:
                                    st.markdown(content)
                        elif role == "tool":
                            # tool 角色也折叠
                            with st.expander("📤 工具执行结果", expanded=False):
                                stripped = content.strip()
                                if stripped.startswith('{') or stripped.startswith('['):
                                    try:
                                        json_content = json.loads(content)
                                        formatted = json.dumps(json_content, ensure_ascii=False, indent=2)
                                        st.text(formatted)
                                    except:
                                        st.markdown(content)
                                else:
                                    st.markdown(content)
                        else:
                            st.markdown(content) # 支持 Markdown 渲染

                    # 3. 如果有工具调用 (Tool Calls)
                    all_tool_calls = tool_calls + tool_calls_in_content
                    if all_tool_calls:
                        with st.expander("🔍 工具调用", expanded=False):
                            for tc in all_tool_calls:
                                # 兼容三种格式：
                                # 1. OpenAI 格式：{function: {name, arguments}}
                                # 2. Claude 格式：{name, arguments}
                                # 3. 新格式：{name, input}
                                if "function" in tc:
                                    func_name = tc.get("function", {}).get("name", "unknown")
                                    args = tc.get("function", {}).get("arguments", "{}")
                                else:
                                    func_name = tc.get("name", "unknown")
                                    args = tc.get("arguments", tc.get("input", {}))
                                # 普通文本展示
                                args_str = args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)
                                st.text(f"{func_name}: {args_str}")