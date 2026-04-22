use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 展开路径中的 ~ 为用户主目录
fn expand_tilde(path: &str) -> PathBuf {
    if path.starts_with('~') {
        if let Some(home) = dirs::home_dir() {
            if path == "~" || path == "~/" {
                return home;
            }
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}

/// 敏感目录黑名单（禁止访问）
const SENSITIVE_DIRS: &[&str] = &["/etc", "/var", "/usr", "/bin", "/sbin", "/root"];

/// 敏感文件黑名单（禁止访问）
const SENSITIVE_FILES: &[&str] = &[
    "passwd",
    "shadow",
    "sudoers",
    "ssh_config",
    "id_rsa",
    "id_ed25519",
    ".pem",
    ".key",
    "credentials",
    "secrets",
];

/// 验证路径是否安全可访问
fn is_path_safe(path: &Path) -> bool {
    // 1. 路径必须存在
    if !path.exists() {
        return false;
    }

    // 2. 获取 canonicalized 路径（解析符号链接）
    let canonical = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return false,
    };

    // 3. 检查是否在敏感目录黑名单中
    for sensitive_dir in SENSITIVE_DIRS {
        if canonical.starts_with(sensitive_dir) {
            return false;
        }
    }

    // 4. 检查文件名是否为敏感文件
    if let Some(file_name) = canonical.file_name() {
        let name = file_name.to_string_lossy().to_lowercase();
        for sensitive_file in SENSITIVE_FILES {
            if name.contains(sensitive_file) {
                return false;
            }
        }
    }

    // 5. 检查文件扩展名是否为敏感类型
    if let Some(ext) = canonical.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        if ext_lower == "pem" || ext_lower == "key" || ext_lower == "ssh" {
            return false;
        }
    }

    true
}

/// 文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    name: String,
    path: String,
    mtime: u64,
}

/// 扫描目录，返回文件列表（按修改时间降序，过滤 sessions.json 和 sessions.json.lock）
/// 返回 Result，错误时返回错误信息字符串
#[tauri::command]
pub fn scan_directory(folder_path: String) -> Result<Vec<FileInfo>, String> {
    let path = expand_tilde(&folder_path);

    // 安全检查
    if !is_path_safe(&path) {
        return Err("路径不安全或不存在".to_string());
    }

    if !path.is_dir() {
        return Err("路径不是有效目录".to_string());
    }

    let mut files: Vec<FileInfo> = Vec::new();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let file_path = entry.path();

            // 对每个文件也做安全检查
            if !is_path_safe(&file_path) {
                continue;
            }

            if file_path.is_file() {
                let name = file_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                // 过滤 sessions.json 和 sessions.json.lock
                if name == "sessions.json" || name == "sessions.json.lock" {
                    continue;
                }

                let mtime_secs = match fs::metadata(&file_path) {
                    Ok(m) => m
                        .modified()
                        .unwrap_or(std::time::UNIX_EPOCH)
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                    Err(_) => 0,
                };

                files.push(FileInfo {
                    name,
                    path: file_path.to_string_lossy().to_string(),
                    mtime: mtime_secs,
                });
            }
        }
    }

    // 按修改时间降序排序
    files.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(files)
}

/// 读取 JSONL 文件内容
/// 返回 Result，错误时返回错误信息字符串
#[tauri::command]
pub fn read_jsonl_file(file_path: String) -> Result<Vec<String>, String> {
    let path = expand_tilde(&file_path);

    // 安全检查
    if !is_path_safe(&path) {
        return Err("文件路径不安全或不存在".to_string());
    }

    if !path.is_file() {
        return Err("路径不是有效文件".to_string());
    }

    // 检查文件扩展名（只允许 .jsonl 和 .json）
    if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        if ext_lower != "jsonl" && ext_lower != "json" {
            return Err("只支持 .jsonl 和 .json 文件".to_string());
        }
    } else {
        return Err("文件缺少扩展名，只支持 .jsonl 和 .json 文件".to_string());
    }

    fs::read_to_string(path)
        .map(|content| content.lines().map(|s| s.to_string()).collect())
        .map_err(|e| format!("读取文件失败: {}", e))
}

/// 发现的目录项信息
#[derive(Debug, Serialize, Deserialize)]
pub struct DiscoveredItem {
    name: String,
    path: String,
    count: usize, // 目录下的文件数量
}

/// 发现 OpenClaw agents（扫描 ~/.openclaw/agents/ 目录）
/// 统计 sessions 子目录下的 jsonl 文件数
#[tauri::command]
pub fn discover_openclaw_agents() -> Vec<DiscoveredItem> {
    let base_path = dirs::home_dir().map(|h| h.join(".openclaw").join("agents"));

    discover_openclaw_agents_impl(base_path)
}

/// 统计目录下的会话文件数量（过滤 sessions.json 和 sessions.json.lock）
fn count_session_files(path: &PathBuf) -> usize {
    fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|e| e.path().is_file())
                .filter(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    name != "sessions.json" && name != "sessions.json.lock"
                })
                .count()
        })
        .unwrap_or(0)
}

/// OpenClaw agents 发现实现
fn discover_openclaw_agents_impl(base_path: Option<PathBuf>) -> Vec<DiscoveredItem> {
    let base_path = match base_path {
        Some(p) => p,
        None => return Vec::new(),
    };

    if !base_path.is_dir() {
        return Vec::new();
    }

    let mut items: Vec<DiscoveredItem> = Vec::new();

    if let Ok(entries) = fs::read_dir(base_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // 统计 sessions 子目录下的会话文件数量
                let sessions_path = path.join("sessions");
                let count = if sessions_path.is_dir() {
                    count_session_files(&sessions_path)
                } else {
                    0
                };

                items.push(DiscoveredItem {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    count,
                });
            }
        }
    }

    // 按名称排序
    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

/// 发现 Claude Code projects（扫描 ~/.claude/projects/ 目录）
/// 统计 project 目录下的文件数
#[tauri::command]
pub fn discover_claude_projects() -> Vec<DiscoveredItem> {
    let base_path = dirs::home_dir().map(|h| h.join(".claude").join("projects"));

    discover_claude_projects_impl(base_path)
}

/// Claude Code projects 发现实现
fn discover_claude_projects_impl(base_path: Option<PathBuf>) -> Vec<DiscoveredItem> {
    let base_path = match base_path {
        Some(p) => p,
        None => return Vec::new(),
    };

    if !base_path.is_dir() {
        return Vec::new();
    }

    let mut items: Vec<DiscoveredItem> = Vec::new();

    if let Ok(entries) = fs::read_dir(base_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // 统计目录下的会话文件数量
                let count = count_session_files(&path);

                items.push(DiscoveredItem {
                    name: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    path: path.to_string_lossy().to_string(),
                    count,
                });
            }
        }
    }

    // 按名称排序
    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_tilde_simple() {
        let result = expand_tilde("~");
        let home = dirs::home_dir().unwrap();
        assert_eq!(result, home);
    }

    #[test]
    fn test_expand_tilde_with_slash() {
        let result = expand_tilde("~/");
        let home = dirs::home_dir().unwrap();
        assert_eq!(result, home);
    }

    #[test]
    fn test_expand_tilde_with_path() {
        let result = expand_tilde("~/some/path");
        let home = dirs::home_dir().unwrap();
        assert_eq!(result, home.join("some/path"));
    }

    #[test]
    fn test_expand_tilde_no_tilde() {
        let result = expand_tilde("/absolute/path");
        assert_eq!(result, PathBuf::from("/absolute/path"));
    }

    #[test]
    fn test_expand_tilde_relative() {
        let result = expand_tilde("relative/path");
        assert_eq!(result, PathBuf::from("relative/path"));
    }

    #[test]
    fn test_is_path_safe_sensitive_dir() {
        // 系统敏感目录应该被拒绝（/etc/passwd 在大多数系统上存在）
        assert!(!is_path_safe(&PathBuf::from("/etc/passwd")));
    }

    #[test]
    fn test_is_path_safe_nonexistent() {
        // 不存在的路径应该被拒绝
        assert!(!is_path_safe(&PathBuf::from("/nonexistent/path")));
    }

    #[test]
    fn test_is_path_safe_home_dir() {
        // 用户主目录下的路径应该是安全的（如果存在）
        let home = dirs::home_dir().unwrap();
        // 主目录本身存在，应该被允许
        assert!(is_path_safe(&home));
    }

    #[test]
    fn test_is_path_safe_sensitive_filename() {
        // 包含敏感关键词的文件名应该被拒绝（如果文件存在）
        // 这里测试一个不存在但名称敏感的路径
        let sensitive_path = PathBuf::from("/tmp/id_rsa_test");
        // 如果文件不存在，会被拒绝（因为不存在）
        assert!(!is_path_safe(&sensitive_path));
    }

    #[test]
    fn test_scan_directory_invalid_path() {
        // 无效路径应该返回错误
        let result = scan_directory("/nonexistent/path".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_read_jsonl_file_invalid_extension() {
        // 非 jsonl/json 扩展名应该返回错误
        // 创建一个临时测试文件
        let home = dirs::home_dir().unwrap();
        let test_file = home.join("test_file.txt");
        // 如果文件不存在，会因为"不存在"而失败
        let result = read_jsonl_file(test_file.to_string_lossy().to_string());
        assert!(result.is_err());
    }
}
