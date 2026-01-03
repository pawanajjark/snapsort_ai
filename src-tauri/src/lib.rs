use base64::Engine;
use notify::RecommendedWatcher;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::time::sleep;

struct WatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    api_key: Mutex<String>,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
#[serde(rename_all = "snake_case")]
enum AnthropicContent {
    Text { text: String },
    Image { source: AnthropicImageSource },
}

#[derive(Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

// Proposal Event Structure
#[derive(Serialize, Clone)]
struct FileProposal {
    id: String,
    original_path: String,
    original_name: String,
    proposed_name: String,
    proposed_category: String,
    reasoning: String,
}

// Skipped file event
#[derive(Serialize, Clone)]
struct SkippedFile {
    name: String,
    size: u64,
    reason: String,
}

// File info for folder listing
#[derive(Serialize, Clone)]
struct FileInfo {
    path: String,
    name: String,
    size: u64,
    is_valid: bool, // Under 5MB
}

// 5MB limit
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;

#[tauri::command]
fn execute_action(original_path: String, new_path: String) -> Result<String, String> {
    let src = Path::new(&original_path);
    let dst = Path::new(&new_path);

    if !src.exists() {
        return Err("Source file no longer exists".to_string());
    }

    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::rename(src, dst).map_err(|e| e.to_string())?;
    Ok("Success".to_string())
}

async fn process_file(path: std::path::PathBuf, api_key: String, app: AppHandle) {
    println!("======================================");
    println!("[RUST] process_file CALLED");
    println!("[RUST] Full path: {:?}", path);

    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    println!("[RUST] Filename: {}", filename);

    // Filter
    let is_png = filename.to_lowercase().ends_with(".png");
    let has_screenshot = filename.contains("Screenshot") || filename.contains("Screen Shot");
    println!(
        "[RUST] Is PNG: {}, Has 'Screenshot': {}",
        is_png, has_screenshot
    );

    if !is_png || !has_screenshot {
        println!("[RUST] ❌ IGNORED - not a screenshot PNG");
        println!("======================================");
        return;
    }

    // Check file size before processing
    let metadata = match std::fs::metadata(&path) {
        Ok(m) => m,
        Err(e) => {
            println!("[RUST] ❌ Failed to get file metadata: {}", e);
            let _ = app.emit("file-failed", filename);
            return;
        }
    };

    let file_size = metadata.len();
    println!(
        "[RUST] File size: {} bytes ({:.2} MB)",
        file_size,
        file_size as f64 / 1024.0 / 1024.0
    );

    if file_size > MAX_FILE_SIZE {
        println!("[RUST] ⚠️ File exceeds 5MB limit - SKIPPING");
        let _ = app.emit(
            "file-skipped",
            SkippedFile {
                name: filename.clone(),
                size: file_size,
                reason: "exceeds 5MB limit".to_string(),
            },
        );
        println!("======================================");
        return;
    }

    println!("[RUST] ✅ File matches and under size limit! Processing...");
    println!("[RUST] Emitting file-processing event to frontend...");
    let emit_result = app.emit("file-processing", &filename);
    println!("[RUST] Emit result: {:?}", emit_result);

    println!("[RUST] Waiting 2 seconds for file to settle...");
    sleep(Duration::from_secs(2)).await;

    println!("[RUST] Reading file from disk...");
    let Ok(image_data) = std::fs::read(&path) else {
        println!("[RUST] ❌ Failed to read file!");
        let _ = app.emit("file-failed", filename);
        return;
    };
    println!("[RUST] File read OK, size: {} bytes", image_data.len());
    let base64_image = base64::engine::general_purpose::STANDARD.encode(&image_data);
    println!(
        "[RUST] Base64 encoded, length: {} chars",
        base64_image.len()
    );

    let client = reqwest::Client::new();
    let prompt = "Analyze this screenshot. Output JSON only.

Rules:
- 'new_filename': snake_case, 3-4 words max, descriptive, .png
- 'category': ONE simple word from: Code, Finance, Social, Shopping, Email, Chat, Browser, Design, Documents, Settings, Media, Other
- 'reasoning': 2-3 words why

Example: {\"new_filename\": \"stripe_invoice.png\", \"category\": \"Finance\", \"reasoning\": \"payment receipt\"}";

    let messages = vec![AnthropicMessage {
        role: "user".to_string(),
        content: vec![
            AnthropicContent::Image {
                source: AnthropicImageSource {
                    source_type: "base64".to_string(),
                    media_type: "image/png".to_string(),
                    data: base64_image,
                },
            },
            AnthropicContent::Text {
                text: prompt.to_string(),
            },
        ],
    }];

    let request_body = serde_json::json!({
        "model": "claude-opus-4-5-20251101",
        "max_tokens": 1024,
        "messages": messages
    });

    println!("[RUST] Sending request to Anthropic API...");
    println!(
        "[RUST] API Key (first 10 chars): {}...",
        &api_key.chars().take(10).collect::<String>()
    );

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await;

    match res {
        Ok(response) => {
            let status = response.status();
            println!("[RUST] ✅ API Response received, status: {}", status);

            if let Ok(json) = response.json::<serde_json::Value>().await {
                println!(
                    "[RUST] Full API Response: {}",
                    serde_json::to_string_pretty(&json).unwrap_or_default()
                );

                if let Some(content) = json["content"][0]["text"].as_str() {
                    println!("[RUST] Extracted text content: {}", content);
                    let clean_json = content.trim().replace("```json", "").replace("```", "");
                    println!("[RUST] Cleaned JSON: {}", clean_json);

                    #[derive(Deserialize)]
                    struct ClaudeResp {
                        new_filename: String,
                        category: String,
                        reasoning: Option<String>,
                    }

                    match serde_json::from_str::<ClaudeResp>(&clean_json) {
                        Ok(parsed) => {
                            println!("[RUST] ✅ Parsed successfully!");
                            println!("[RUST] new_filename: {}", parsed.new_filename);
                            println!("[RUST] category: {}", parsed.category);

                            let proposal = FileProposal {
                                id: filename.clone(),
                                original_path: path.to_string_lossy().to_string(),
                                original_name: filename,
                                proposed_name: parsed.new_filename,
                                proposed_category: parsed.category,
                                reasoning: parsed.reasoning.unwrap_or_default(),
                            };

                            println!("[RUST] Emitting file-proposed event...");
                            let emit_result = app.emit("file-proposed", proposal);
                            println!("[RUST] file-proposed emit result: {:?}", emit_result);
                        }
                        Err(e) => {
                            println!("[RUST] ❌ JSON parse error: {:?}", e);
                            let _ = app.emit("file-failed", filename);
                        }
                    }
                } else {
                    println!("[RUST] ❌ Could not extract text from response");
                    println!("[RUST] content array: {:?}", json["content"]);
                    let _ = app.emit("file-failed", filename);
                }
            } else {
                println!("[RUST] ❌ Failed to parse response as JSON");
                let _ = app.emit("file-failed", filename);
            }
        }
        Err(e) => {
            println!("[RUST] ❌ API Request FAILED: {:?}", e);
            let _ = app.emit("file-failed", filename);
        }
    }
    println!("======================================");
}

#[tauri::command]
fn start_watch(
    app: AppHandle,
    state: State<WatcherState>,
    path: String,
    api_key: String,
) -> Result<String, String> {
    println!("======================================");
    println!("[RUST] start_watch COMMAND CALLED");
    println!("[RUST] Watch path: {}", path);
    println!("[RUST] API key length: {}", api_key.len());
    println!("======================================");

    *state.api_key.lock().unwrap() = api_key.clone();

    // Process existing files in the directory
    println!("[RUST] 🔍 Scanning for existing files in directory...");
    let dir_path = Path::new(&path);
    let mut files_to_process = Vec::new();

    let mut skipped_count: u32 = 0;

    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let file_path = entry.path();
                    let filename = file_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();

                    let is_png = filename.to_lowercase().ends_with(".png");
                    let has_screenshot =
                        filename.contains("Screenshot") || filename.contains("Screen Shot");

                    if is_png && has_screenshot {
                        // Check file size
                        if let Ok(metadata) = entry.metadata() {
                            let file_size = metadata.len();
                            if file_size > MAX_FILE_SIZE {
                                println!("[RUST] ⚠️ Skipping {} - exceeds 5MB", filename);
                                let _ = app.emit(
                                    "file-skipped",
                                    SkippedFile {
                                        name: filename,
                                        size: file_size,
                                        reason: "exceeds 5MB limit".to_string(),
                                    },
                                );
                                skipped_count += 1;
                            } else {
                                files_to_process.push(file_path);
                            }
                        }
                    }
                }
            }
        }
    } else {
        println!("[RUST] ⚠️ Could not read directory");
    }

    println!("[RUST] Skipped {} files due to size limit", skipped_count);

    println!("[RUST] Found {} actionable files", files_to_process.len());
    let _ = app.emit("scan-summary", files_to_process.len());

    for file_path in files_to_process {
        println!("[RUST] Queueing existing file: {:?}", file_path);
        let app_h = app.clone();
        let k = api_key.clone();
        tauri::async_runtime::spawn(async move {
            process_file(file_path, k, app_h).await;
        });
    }

    println!("[RUST] Finished scanning existing files");
    println!("======================================");

    // Watcher logic removed as per user request (only process existing files)
    // println!("[RUST] Creating file watcher...");
    // ...

    Ok(format!("Scanned {}", path))
}

#[tauri::command]
fn stop_watch(state: State<WatcherState>) -> Result<String, String> {
    let mut watcher = state.watcher.lock().unwrap();
    *watcher = None; // Drop watcher to stop it
    Ok("Stopped watching".to_string())
}

// Re-analyze a file to get a more specific subcategory
#[derive(Serialize, Clone)]
struct SubcategoryResult {
    id: String,
    subcategory: String,
}

// List all screenshot files in a folder
#[tauri::command]
fn list_folder_screenshots(path: String) -> Result<Vec<FileInfo>, String> {
    println!("[RUST] list_folder_screenshots called for: {}", path);

    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err("Directory does not exist".to_string());
    }

    let mut files: Vec<FileInfo> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let file_path = entry.path();
                    let filename = file_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();

                    // Check if it's a screenshot PNG
                    let is_png = filename.to_lowercase().ends_with(".png");
                    let has_screenshot =
                        filename.contains("Screenshot") || filename.contains("Screen Shot");

                    if is_png && has_screenshot {
                        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        files.push(FileInfo {
                            path: file_path.to_string_lossy().to_string(),
                            name: filename,
                            size,
                            is_valid: size <= MAX_FILE_SIZE,
                        });
                    }
                }
            }
        }
    }

    // Sort by name
    files.sort_by(|a, b| a.name.cmp(&b.name));

    println!("[RUST] Found {} screenshot files", files.len());
    Ok(files)
}

#[tauri::command]
async fn get_subcategory(
    file_path: String,
    parent_category: String,
    api_key: String,
) -> Result<SubcategoryResult, String> {
    println!("[RUST] get_subcategory called for: {}", file_path);

    let path = std::path::Path::new(&file_path);
    let filename = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Check file size first
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err("File exceeds 5MB limit".to_string());
    }

    let Ok(image_data) = std::fs::read(&path) else {
        return Err("Failed to read file".to_string());
    };
    let base64_image = base64::engine::general_purpose::STANDARD.encode(&image_data);

    let client = reqwest::Client::new();
    let prompt = format!(
        "This screenshot is currently categorized as '{}'. Look at the image and give a MORE SPECIFIC subcategory. \
        Output ONLY a JSON object with 'subcategory' (2-3 words max, be specific based on what you see). \
        Examples for Finance: 'Receipts', 'Bank_Statements', 'Invoices', 'Tax_Documents', 'Subscriptions'. \
        Examples for Dev: 'Terminal', 'Code_Editor', 'Documentation', 'GitHub', 'Errors'. \
        Example output: {{\"subcategory\": \"Bank_Statements\"}}",
        parent_category
    );

    let messages = vec![AnthropicMessage {
        role: "user".to_string(),
        content: vec![
            AnthropicContent::Image {
                source: AnthropicImageSource {
                    source_type: "base64".to_string(),
                    media_type: "image/png".to_string(),
                    data: base64_image,
                },
            },
            AnthropicContent::Text { text: prompt },
        ],
    }];

    let request_body = serde_json::json!({
        "model": "claude-opus-4-5-20251101",
        "max_tokens": 256,
        "messages": messages
    });

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    println!("[RUST] get_subcategory API response status: {}", status);

    let json: serde_json::Value = res.json().await.map_err(|e| {
        println!("[RUST] get_subcategory JSON parse error: {}", e);
        e.to_string()
    })?;

    println!(
        "[RUST] get_subcategory response: {}",
        serde_json::to_string_pretty(&json).unwrap_or_default()
    );

    if let Some(content) = json["content"][0]["text"].as_str() {
        let clean_json = content
            .trim()
            .replace("```json", "")
            .replace("```", "")
            .trim()
            .to_string();
        println!("[RUST] Cleaned subcategory JSON: {}", clean_json);

        #[derive(Deserialize)]
        struct SubResp {
            subcategory: String,
        }

        match serde_json::from_str::<SubResp>(&clean_json) {
            Ok(parsed) => {
                println!(
                    "[RUST] ✅ Subcategory for {}: {}",
                    filename, parsed.subcategory
                );
                return Ok(SubcategoryResult {
                    id: filename,
                    subcategory: parsed.subcategory,
                });
            }
            Err(e) => {
                println!("[RUST] ❌ Failed to parse subcategory JSON: {}", e);
            }
        }
    } else {
        println!("[RUST] ❌ No content in response");
    }

    Err("Failed to parse subcategory".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(WatcherState {
            watcher: Mutex::new(None),
            api_key: Mutex::new(String::new()),
        })
        .invoke_handler(tauri::generate_handler![
            start_watch,
            stop_watch,
            execute_action,
            get_subcategory,
            list_folder_screenshots
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
