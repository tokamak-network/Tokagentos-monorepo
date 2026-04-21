//! Services for tokagentOS
//!
//! This module contains service implementations for the tokagentOS runtime.

pub mod hook_service;
pub mod message_service;

pub use hook_service::{
    map_legacy_event, map_legacy_events, HookEligibilityResult, HookEventType, HookLoadError,
    HookLoadResult, HookLoadSkipped, HookMetadata, HookRegistration, HookRegistrationOptions,
    HookRequirements, HookService, HookSnapshot, HookSource, HookSummary, DEFAULT_HOOK_PRIORITY,
};
pub use message_service::{
    DefaultMessageService, IMessageService, MessageProcessingOptions, MessageProcessingResult,
};
