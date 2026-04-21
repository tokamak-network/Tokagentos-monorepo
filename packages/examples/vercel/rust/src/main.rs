//! Local test runner for the Vercel Edge Function (Rust)
//!
//! This binary runs the handler locally for testing before deploying to Vercel.
//! 
//! Run with: cargo run --bin test_local

use tokagentos_vercel_edge::{ChatRequest, ChatResponse, HealthResponse, ErrorResponse};

fn main() {
    println!("🧪 Testing tokagentOS Vercel Edge Function Handler (Rust)\n");
    println!("Note: For full WASM testing, use wasm-pack test --node");
    println!();

    // Test 1: Health response serialization
    println!("1️⃣  Testing health response serialization...");
    let health = HealthResponse {
        status: "healthy".to_string(),
        runtime: "tokagentos-rust".to_string(),
        version: "1.0.0".to_string(),
    };
    let json = serde_json::to_string(&health).expect("Failed to serialize");
    println!("   Response: {}", json);
    assert!(json.contains("healthy"));
    println!("   ✅ Health response serialization passed\n");

    // Test 2: Chat request deserialization
    println!("2️⃣  Testing chat request deserialization...");
    let json = r#"{"message": "Hello!", "userId": "user-123", "conversationId": "conv-456"}"#;
    let request: ChatRequest = serde_json::from_str(json).expect("Failed to deserialize");
    assert_eq!(request.message, "Hello!");
    assert_eq!(request.user_id, Some("user-123".to_string()));
    assert_eq!(request.conversation_id, Some("conv-456".to_string()));
    println!("   Message: {}", request.message);
    println!("   User ID: {:?}", request.user_id);
    println!("   Conversation ID: {:?}", request.conversation_id);
    println!("   ✅ Chat request deserialization passed\n");

    // Test 3: Error response serialization
    println!("3️⃣  Testing error response serialization...");
    let error = ErrorResponse {
        error: "Test error".to_string(),
        code: "TEST_ERROR".to_string(),
    };
    let json = serde_json::to_string(&error).expect("Failed to serialize");
    println!("   Response: {}", json);
    assert!(json.contains("TEST_ERROR"));
    println!("   ✅ Error response serialization passed\n");

    // Test 4: Chat response serialization
    println!("4️⃣  Testing chat response serialization...");
    let response = ChatResponse {
        response: "Hello! I'm Tokagent.".to_string(),
        conversation_id: "conv-123".to_string(),
        timestamp: "2025-01-10T12:00:00.000Z".to_string(),
    };
    let json = serde_json::to_string(&response).expect("Failed to serialize");
    println!("   Response: {}", json);
    assert!(json.contains("Tokagent"));
    println!("   ✅ Chat response serialization passed\n");

    println!("🎉 All serialization tests passed!");
    println!();
    println!("To run full WASM tests with tokagentOS runtime:");
    println!("  wasm-pack test --node");
}










