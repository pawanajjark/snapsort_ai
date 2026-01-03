use tauri::{AppHandle, Emitter, Manager, State};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::sync::{Arc, Mutex};
use std::path::Path;
use std::time::Duration;
use tokio::time::sleep;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
struct FileAction {
    original: String,
    new: String,
    category: String,
    status: String,
}

struct WatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    api_key: Mutex<String>,
}

#[derive(Serialize, Deserialize)]
struct ClaudeResponse {
    new_filename: String,
    category: String,
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
    
    let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    println!("[RUST] Filename: {}", filename);
    
    // Filter
    let is_png = filename.to_lowercase().ends_with(".png");
    let has_screenshot = filename.contains("Screenshot") || filename.contains("Screen Shot");
    println!("[RUST] Is PNG: {}, Has 'Screenshot': {}", is_png, has_screenshot);
    
    if !is_png || !has_screenshot {
        println!("[RUST] ❌ IGNORED - not a screenshot PNG");
        println!("======================================");
        return;
    }

    println!("[RUST] ✅ File matches! Processing...");
    println!("[RUST] Emitting file-processing event to frontend...");
    let emit_result = app.emit("file-processing", &filename);
    println!("[RUST] Emit result: {:?}", emit_result);
    
    println!("[RUST] Waiting 2 seconds for file to settle...");
    sleep(Duration::from_secs(2)).await;

    println!("[RUST] Reading file from disk...");
    let Ok(image_data) = std::fs::read(&path) else { 
        println!("[RUST] ❌ Failed to read file!");
        return; 
    };
    println!("[RUST] File read OK, size: {} bytes", image_data.len());
    let base64_image = base64::encode(&image_data);
    println!("[RUST] Base64 encoded, length: {} chars", base64_image.len());

    let client = reqwest::Client::new();
    let prompt = "Analyze this screenshot. Output JSON with 'new_filename' (snake_case, descriptive .png), 'category' (e.g. Finance, Dev), and 'reasoning' (very short why). Example: {\"new_filename\": \"stripe.png\", \"category\": \"Finance\", \"reasoning\": \"Stripe receipt\"}";

    let messages = vec![
        AnthropicMessage {
            role: "user".to_string(),
            content: vec![
                AnthropicContent::Image {
                    source: AnthropicImageSource {
                        source_type: "base64".to_string(),
                        media_type: "image/png".to_string(),
                        data: base64_image,
                    }
                },
                AnthropicContent::Text { text: prompt.to_string() }
            ]
        }
    ];

    let request_body = serde_json::json!({
        "model": "claude-opus-4-5-20251101",
        "max_tokens": 1024,
        "messages": messages
    });

    println!("[RUST] Sending request to Anthropic API...");
    println!("[RUST] API Key (first 10 chars): {}...", &api_key.chars().take(10).collect::<String>());
    
    let res = client.post("https://api.anthropic.com/v1/messages")
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
               println!("[RUST] Full API Response: {}", serde_json::to_string_pretty(&json).unwrap_or_default());
               
               if let Some(content) = json["content"][0]["text"].as_str() {
                    println!("[RUST] Extracted text content: {}", content);
                    let clean_json = content.trim().replace("```json", "").replace("```", "");
                    println!("[RUST] Cleaned JSON: {}", clean_json);
                    
                    #[derive(Deserialize)]
                    struct ClaudeResp { new_filename: String, category: String, reasoning: Option<String> }

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
                        }
                    }
               } else {
                   println!("[RUST] ❌ Could not extract text from response");
                   println!("[RUST] content array: {:?}", json["content"]);
               }
            } else {
                println!("[RUST] ❌ Failed to parse response as JSON");
            }
        },
        Err(e) => {
            println!("[RUST] ❌ API Request FAILED: {:?}", e);
        }
    }
    println!("======================================");
}

#[tauri::command]
fn start_watch(app: AppHandle, state: State<WatcherState>, path: String, api_key: String) -> Result<String, String> {
    println!("======================================");
    println!("[RUST] start_watch COMMAND CALLED");
    println!("[RUST] Watch path: {}", path);
    println!("[RUST] API key length: {}", api_key.len());
    println!("======================================");
    
    *state.api_key.lock().unwrap() = api_key.clone();
    
    let path_clone = path.clone();
    let api_key_clone = api_key.clone();
    let app_handle = app.clone();

    // Process existing files in the directory
    println!("[RUST] 🔍 Scanning for existing files in directory...");
    let dir_path = Path::new(&path);
    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let file_path = entry.path();
                    println!("[RUST] Found existing file: {:?}", file_path);
                    let app_h = app.clone();
                    let k = api_key.clone();
                    tauri::async_runtime::spawn(async move {
                        process_file(file_path, k, app_h).await;
                    });
                }
            }
        }
    } else {
        println!("[RUST] ⚠️ Could not read directory");
    }
    println!("[RUST] Finished scanning existing files");
    println!("======================================");

    println!("[RUST] Creating file watcher...");
    
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        println!("[RUST] >>> WATCHER CALLBACK TRIGGERED <<<");
        match res {
            Ok(event) => {
                println!("[RUST] Event kind: {:?}", event.kind);
                println!("[RUST] Event paths: {:?}", event.paths);
                
                if let EventKind::Create(_) = event.kind {
                    println!("[RUST] ✅ This is a CREATE event - processing files...");
                    for path in event.paths {
                        println!("[RUST] Spawning process_file for: {:?}", path);
                        let app_h = app_handle.clone();
                        let k = api_key_clone.clone();
                        tauri::async_runtime::spawn(async move {
                            process_file(path, k, app_h).await;
                        });
                    }
                } else {
                    println!("[RUST] ⏭️ Ignoring non-CREATE event");
                }
            },
            Err(e) => println!("[RUST] ❌ Watch error: {:?}", e),
        }
    }).map_err(|e| e.to_string())?;

    println!("[RUST] Attaching watcher to path: {}", path);
    watcher.watch(Path::new(&path), RecursiveMode::NonRecursive).map_err(|e| {
        println!("[RUST] ❌ Failed to watch path: {}", e);
        e.to_string()
    })?;
    
    println!("[RUST] ✅ Watcher attached successfully!");
    *state.watcher.lock().unwrap() = Some(watcher);

    println!("[RUST] ✅ Now watching: {}", path_clone);
    Ok(format!("Watching {}", path_clone))
}

#[tauri::command]
fn stop_watch(state: State<WatcherState>) -> Result<String, String> {
    let mut watcher = state.watcher.lock().unwrap();
    *watcher = None; // Drop watcher to stop it
    Ok("Stopped watching".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState {
            watcher: Mutex::new(None),
            api_key: Mutex::new(String::new()),
        })
        .invoke_handler(tauri::generate_handler![start_watch, stop_watch, execute_action])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
