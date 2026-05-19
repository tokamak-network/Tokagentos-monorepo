import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Entity, Room, World } from "./environment_pb.js";
import type { Memory } from "./memory_pb.js";
import type { ModelType } from "./model_pb.js";
import type { Content } from "./primitives_pb.js";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/events.proto.
 */
export declare const file_tokagent_v1_events: GenFile;
/**
 * Base payload interface for all events
 *
 * @generated from message tokagent.v1.EventPayload
 */
export type EventPayload = Message<"tokagent.v1.EventPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
};
/**
 * Describes the message tokagent.v1.EventPayload.
 * Use `create(EventPayloadSchema)` to create a new message.
 */
export declare const EventPayloadSchema: GenMessage<EventPayload>;
/**
 * Payload for world-related events
 *
 * @generated from message tokagent.v1.WorldPayload
 */
export type WorldPayload = Message<"tokagent.v1.WorldPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: tokagent.v1.World world = 2;
     */
    world?: World;
    /**
     * @generated from field: repeated tokagent.v1.Room rooms = 3;
     */
    rooms: Room[];
    /**
     * @generated from field: repeated tokagent.v1.Entity entities = 4;
     */
    entities: Entity[];
};
/**
 * Describes the message tokagent.v1.WorldPayload.
 * Use `create(WorldPayloadSchema)` to create a new message.
 */
export declare const WorldPayloadSchema: GenMessage<WorldPayload>;
/**
 * Payload for entity-related events
 *
 * @generated from message tokagent.v1.EntityPayload
 */
export type EntityPayload = Message<"tokagent.v1.EntityPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: string entity_id = 2;
     */
    entityId: string;
    /**
     * @generated from field: optional string world_id = 3;
     */
    worldId?: string;
    /**
     * @generated from field: optional string room_id = 4;
     */
    roomId?: string;
    /**
     * @generated from field: optional tokagent.v1.EntityMetadata metadata = 5;
     */
    metadata?: EntityMetadata;
};
/**
 * Describes the message tokagent.v1.EntityPayload.
 * Use `create(EntityPayloadSchema)` to create a new message.
 */
export declare const EntityPayloadSchema: GenMessage<EntityPayload>;
/**
 * Entity metadata for events
 *
 * @generated from message tokagent.v1.EntityMetadata
 */
export type EntityMetadata = Message<"tokagent.v1.EntityMetadata"> & {
    /**
     * @generated from field: string original_id = 1;
     */
    originalId: string;
    /**
     * @generated from field: string username = 2;
     */
    username: string;
    /**
     * @generated from field: optional string display_name = 3;
     */
    displayName?: string;
    /**
     * @generated from field: google.protobuf.Struct extra = 4;
     */
    extra?: JsonObject;
};
/**
 * Describes the message tokagent.v1.EntityMetadata.
 * Use `create(EntityMetadataSchema)` to create a new message.
 */
export declare const EntityMetadataSchema: GenMessage<EntityMetadata>;
/**
 * Payload for message-related events
 *
 * @generated from message tokagent.v1.MessagePayload
 */
export type MessagePayload = Message<"tokagent.v1.MessagePayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: tokagent.v1.Memory message = 2;
     */
    message?: Memory;
};
/**
 * Describes the message tokagent.v1.MessagePayload.
 * Use `create(MessagePayloadSchema)` to create a new message.
 */
export declare const MessagePayloadSchema: GenMessage<MessagePayload>;
/**
 * Payload for channel cleared events
 *
 * @generated from message tokagent.v1.ChannelClearedPayload
 */
export type ChannelClearedPayload = Message<"tokagent.v1.ChannelClearedPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: string room_id = 2;
     */
    roomId: string;
    /**
     * @generated from field: string channel_id = 3;
     */
    channelId: string;
    /**
     * @generated from field: int32 memory_count = 4;
     */
    memoryCount: number;
};
/**
 * Describes the message tokagent.v1.ChannelClearedPayload.
 * Use `create(ChannelClearedPayloadSchema)` to create a new message.
 */
export declare const ChannelClearedPayloadSchema: GenMessage<ChannelClearedPayload>;
/**
 * Payload for events invoked without a message
 *
 * @generated from message tokagent.v1.InvokePayload
 */
export type InvokePayload = Message<"tokagent.v1.InvokePayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: string world_id = 2;
     */
    worldId: string;
    /**
     * @generated from field: string user_id = 3;
     */
    userId: string;
    /**
     * @generated from field: string room_id = 4;
     */
    roomId: string;
};
/**
 * Describes the message tokagent.v1.InvokePayload.
 * Use `create(InvokePayloadSchema)` to create a new message.
 */
export declare const InvokePayloadSchema: GenMessage<InvokePayload>;
/**
 * Payload for run events
 *
 * @generated from message tokagent.v1.RunEventPayload
 */
export type RunEventPayload = Message<"tokagent.v1.RunEventPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: string run_id = 2;
     */
    runId: string;
    /**
     * @generated from field: string message_id = 3;
     */
    messageId: string;
    /**
     * @generated from field: string room_id = 4;
     */
    roomId: string;
    /**
     * @generated from field: string entity_id = 5;
     */
    entityId: string;
    /**
     * @generated from field: int64 start_time = 6;
     */
    startTime: bigint;
    /**
     * @generated from field: tokagent.v1.RunStatus status = 7;
     */
    status: RunStatus;
    /**
     * @generated from field: optional int64 end_time = 8;
     */
    endTime?: bigint;
    /**
     * @generated from field: optional int64 duration = 9;
     */
    duration?: bigint;
    /**
     * @generated from field: optional string error = 10;
     */
    error?: string;
};
/**
 * Describes the message tokagent.v1.RunEventPayload.
 * Use `create(RunEventPayloadSchema)` to create a new message.
 */
export declare const RunEventPayloadSchema: GenMessage<RunEventPayload>;
/**
 * Payload for action events
 *
 * @generated from message tokagent.v1.ActionEventPayload
 */
export type ActionEventPayload = Message<"tokagent.v1.ActionEventPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: string room_id = 2;
     */
    roomId: string;
    /**
     * @generated from field: string world_id = 3;
     */
    worldId: string;
    /**
     * @generated from field: tokagent.v1.Content content = 4;
     */
    content?: Content;
    /**
     * @generated from field: optional string message_id = 5;
     */
    messageId?: string;
};
/**
 * Describes the message tokagent.v1.ActionEventPayload.
 * Use `create(ActionEventPayloadSchema)` to create a new message.
 */
export declare const ActionEventPayloadSchema: GenMessage<ActionEventPayload>;
/**
 * Payload for evaluator events
 *
 * @generated from message tokagent.v1.EvaluatorEventPayload
 */
export type EvaluatorEventPayload = Message<"tokagent.v1.EvaluatorEventPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: string evaluator_id = 2;
     */
    evaluatorId: string;
    /**
     * @generated from field: string evaluator_name = 3;
     */
    evaluatorName: string;
    /**
     * @generated from field: optional int64 start_time = 4;
     */
    startTime?: bigint;
    /**
     * @generated from field: optional bool completed = 5;
     */
    completed?: boolean;
    /**
     * @generated from field: optional string error = 6;
     */
    error?: string;
};
/**
 * Describes the message tokagent.v1.EvaluatorEventPayload.
 * Use `create(EvaluatorEventPayloadSchema)` to create a new message.
 */
export declare const EvaluatorEventPayloadSchema: GenMessage<EvaluatorEventPayload>;
/**
 * Token usage for model events
 *
 * @generated from message tokagent.v1.ModelTokenUsage
 */
export type ModelTokenUsage = Message<"tokagent.v1.ModelTokenUsage"> & {
    /**
     * @generated from field: int32 prompt = 1;
     */
    prompt: number;
    /**
     * @generated from field: int32 completion = 2;
     */
    completion: number;
    /**
     * @generated from field: int32 total = 3;
     */
    total: number;
};
/**
 * Describes the message tokagent.v1.ModelTokenUsage.
 * Use `create(ModelTokenUsageSchema)` to create a new message.
 */
export declare const ModelTokenUsageSchema: GenMessage<ModelTokenUsage>;
/**
 * Payload for model events
 *
 * @generated from message tokagent.v1.ModelEventPayload
 */
export type ModelEventPayload = Message<"tokagent.v1.ModelEventPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: string provider = 2;
     */
    provider: string;
    /**
     * @generated from field: tokagent.v1.ModelType type = 3;
     */
    type: ModelType;
    /**
     * @generated from field: string prompt = 4;
     */
    prompt: string;
    /**
     * @generated from field: optional tokagent.v1.ModelTokenUsage tokens = 5;
     */
    tokens?: ModelTokenUsage;
};
/**
 * Describes the message tokagent.v1.ModelEventPayload.
 * Use `create(ModelEventPayloadSchema)` to create a new message.
 */
export declare const ModelEventPayloadSchema: GenMessage<ModelEventPayload>;
/**
 * Payload for embedding generation events
 *
 * @generated from message tokagent.v1.EmbeddingGenerationPayload
 */
export type EmbeddingGenerationPayload = Message<"tokagent.v1.EmbeddingGenerationPayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: tokagent.v1.Memory memory = 2;
     */
    memory?: Memory;
    /**
     * @generated from field: tokagent.v1.EmbeddingPriority priority = 3;
     */
    priority: EmbeddingPriority;
    /**
     * @generated from field: optional int32 retry_count = 4;
     */
    retryCount?: number;
    /**
     * @generated from field: optional int32 max_retries = 5;
     */
    maxRetries?: number;
    /**
     * @generated from field: repeated float embedding = 6;
     */
    embedding: number[];
    /**
     * @generated from field: optional string error = 7;
     */
    error?: string;
    /**
     * @generated from field: optional string run_id = 8;
     */
    runId?: string;
};
/**
 * Describes the message tokagent.v1.EmbeddingGenerationPayload.
 * Use `create(EmbeddingGenerationPayloadSchema)` to create a new message.
 */
export declare const EmbeddingGenerationPayloadSchema: GenMessage<EmbeddingGenerationPayload>;
/**
 * UI control payload
 *
 * @generated from message tokagent.v1.UIControlPayload
 */
export type UIControlPayload = Message<"tokagent.v1.UIControlPayload"> & {
    /**
     * @generated from field: tokagent.v1.ControlMessageAction action = 1;
     */
    action: ControlMessageAction;
    /**
     * @generated from field: optional string target = 2;
     */
    target?: string;
    /**
     * @generated from field: optional string reason = 3;
     */
    reason?: string;
    /**
     * @generated from field: optional int32 duration = 4;
     */
    duration?: number;
};
/**
 * Describes the message tokagent.v1.UIControlPayload.
 * Use `create(UIControlPayloadSchema)` to create a new message.
 */
export declare const UIControlPayloadSchema: GenMessage<UIControlPayload>;
/**
 * Control message
 *
 * @generated from message tokagent.v1.ControlMessage
 */
export type ControlMessage = Message<"tokagent.v1.ControlMessage"> & {
    /**
     * Always "control"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: tokagent.v1.UIControlPayload payload = 2;
     */
    payload?: UIControlPayload;
    /**
     * @generated from field: string room_id = 3;
     */
    roomId: string;
};
/**
 * Describes the message tokagent.v1.ControlMessage.
 * Use `create(ControlMessageSchema)` to create a new message.
 */
export declare const ControlMessageSchema: GenMessage<ControlMessage>;
/**
 * Payload for control message events
 *
 * @generated from message tokagent.v1.ControlMessagePayload
 */
export type ControlMessagePayload = Message<"tokagent.v1.ControlMessagePayload"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: tokagent.v1.ControlMessage message = 2;
     */
    message?: ControlMessage;
};
/**
 * Describes the message tokagent.v1.ControlMessagePayload.
 * Use `create(ControlMessagePayloadSchema)` to create a new message.
 */
export declare const ControlMessagePayloadSchema: GenMessage<ControlMessagePayload>;
/**
 * Standard event types across all platforms
 *
 * @generated from enum tokagent.v1.EventType
 */
export declare enum EventType {
    /**
     * @generated from enum value: EVENT_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * World events
     *
     * @generated from enum value: EVENT_TYPE_WORLD_JOINED = 1;
     */
    WORLD_JOINED = 1,
    /**
     * @generated from enum value: EVENT_TYPE_WORLD_CONNECTED = 2;
     */
    WORLD_CONNECTED = 2,
    /**
     * @generated from enum value: EVENT_TYPE_WORLD_LEFT = 3;
     */
    WORLD_LEFT = 3,
    /**
     * Entity events
     *
     * @generated from enum value: EVENT_TYPE_ENTITY_JOINED = 4;
     */
    ENTITY_JOINED = 4,
    /**
     * @generated from enum value: EVENT_TYPE_ENTITY_LEFT = 5;
     */
    ENTITY_LEFT = 5,
    /**
     * @generated from enum value: EVENT_TYPE_ENTITY_UPDATED = 6;
     */
    ENTITY_UPDATED = 6,
    /**
     * Room events
     *
     * @generated from enum value: EVENT_TYPE_ROOM_JOINED = 7;
     */
    ROOM_JOINED = 7,
    /**
     * @generated from enum value: EVENT_TYPE_ROOM_LEFT = 8;
     */
    ROOM_LEFT = 8,
    /**
     * Message events
     *
     * @generated from enum value: EVENT_TYPE_MESSAGE_RECEIVED = 9;
     */
    MESSAGE_RECEIVED = 9,
    /**
     * @generated from enum value: EVENT_TYPE_MESSAGE_SENT = 10;
     */
    MESSAGE_SENT = 10,
    /**
     * @generated from enum value: EVENT_TYPE_MESSAGE_DELETED = 11;
     */
    MESSAGE_DELETED = 11,
    /**
     * Channel events
     *
     * @generated from enum value: EVENT_TYPE_CHANNEL_CLEARED = 12;
     */
    CHANNEL_CLEARED = 12,
    /**
     * Voice events
     *
     * @generated from enum value: EVENT_TYPE_VOICE_MESSAGE_RECEIVED = 13;
     */
    VOICE_MESSAGE_RECEIVED = 13,
    /**
     * @generated from enum value: EVENT_TYPE_VOICE_MESSAGE_SENT = 14;
     */
    VOICE_MESSAGE_SENT = 14,
    /**
     * Interaction events
     *
     * @generated from enum value: EVENT_TYPE_REACTION_RECEIVED = 15;
     */
    REACTION_RECEIVED = 15,
    /**
     * @generated from enum value: EVENT_TYPE_POST_GENERATED = 16;
     */
    POST_GENERATED = 16,
    /**
     * @generated from enum value: EVENT_TYPE_INTERACTION_RECEIVED = 17;
     */
    INTERACTION_RECEIVED = 17,
    /**
     * Run events
     *
     * @generated from enum value: EVENT_TYPE_RUN_STARTED = 18;
     */
    RUN_STARTED = 18,
    /**
     * @generated from enum value: EVENT_TYPE_RUN_ENDED = 19;
     */
    RUN_ENDED = 19,
    /**
     * @generated from enum value: EVENT_TYPE_RUN_TIMEOUT = 20;
     */
    RUN_TIMEOUT = 20,
    /**
     * Action events
     *
     * @generated from enum value: EVENT_TYPE_ACTION_STARTED = 21;
     */
    ACTION_STARTED = 21,
    /**
     * @generated from enum value: EVENT_TYPE_ACTION_COMPLETED = 22;
     */
    ACTION_COMPLETED = 22,
    /**
     * Evaluator events
     *
     * @generated from enum value: EVENT_TYPE_EVALUATOR_STARTED = 23;
     */
    EVALUATOR_STARTED = 23,
    /**
     * @generated from enum value: EVENT_TYPE_EVALUATOR_COMPLETED = 24;
     */
    EVALUATOR_COMPLETED = 24,
    /**
     * Model events
     *
     * @generated from enum value: EVENT_TYPE_MODEL_USED = 25;
     */
    MODEL_USED = 25,
    /**
     * Embedding events
     *
     * @generated from enum value: EVENT_TYPE_EMBEDDING_GENERATION_REQUESTED = 26;
     */
    EMBEDDING_GENERATION_REQUESTED = 26,
    /**
     * @generated from enum value: EVENT_TYPE_EMBEDDING_GENERATION_COMPLETED = 27;
     */
    EMBEDDING_GENERATION_COMPLETED = 27,
    /**
     * @generated from enum value: EVENT_TYPE_EMBEDDING_GENERATION_FAILED = 28;
     */
    EMBEDDING_GENERATION_FAILED = 28,
    /**
     * Control events
     *
     * @generated from enum value: EVENT_TYPE_CONTROL_MESSAGE = 29;
     */
    CONTROL_MESSAGE = 29
}
/**
 * Describes the enum tokagent.v1.EventType.
 */
export declare const EventTypeSchema: GenEnum<EventType>;
/**
 * Platform-specific event type prefix
 *
 * @generated from enum tokagent.v1.PlatformPrefix
 */
export declare enum PlatformPrefix {
    /**
     * @generated from enum value: PLATFORM_PREFIX_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: PLATFORM_PREFIX_DISCORD = 1;
     */
    DISCORD = 1,
    /**
     * @generated from enum value: PLATFORM_PREFIX_TELEGRAM = 2;
     */
    TELEGRAM = 2,
    /**
     * @generated from enum value: PLATFORM_PREFIX_X = 3;
     */
    X = 3
}
/**
 * Describes the enum tokagent.v1.PlatformPrefix.
 */
export declare const PlatformPrefixSchema: GenEnum<PlatformPrefix>;
/**
 * Run status enumeration
 *
 * @generated from enum tokagent.v1.RunStatus
 */
export declare enum RunStatus {
    /**
     * @generated from enum value: RUN_STATUS_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: RUN_STATUS_STARTED = 1;
     */
    STARTED = 1,
    /**
     * @generated from enum value: RUN_STATUS_COMPLETED = 2;
     */
    COMPLETED = 2,
    /**
     * @generated from enum value: RUN_STATUS_TIMEOUT = 3;
     */
    TIMEOUT = 3
}
/**
 * Describes the enum tokagent.v1.RunStatus.
 */
export declare const RunStatusSchema: GenEnum<RunStatus>;
/**
 * Embedding priority enumeration
 *
 * @generated from enum tokagent.v1.EmbeddingPriority
 */
export declare enum EmbeddingPriority {
    /**
     * @generated from enum value: EMBEDDING_PRIORITY_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: EMBEDDING_PRIORITY_HIGH = 1;
     */
    HIGH = 1,
    /**
     * @generated from enum value: EMBEDDING_PRIORITY_NORMAL = 2;
     */
    NORMAL = 2,
    /**
     * @generated from enum value: EMBEDDING_PRIORITY_LOW = 3;
     */
    LOW = 3
}
/**
 * Describes the enum tokagent.v1.EmbeddingPriority.
 */
export declare const EmbeddingPrioritySchema: GenEnum<EmbeddingPriority>;
/**
 * Control message action enumeration
 *
 * @generated from enum tokagent.v1.ControlMessageAction
 */
export declare enum ControlMessageAction {
    /**
     * @generated from enum value: CONTROL_MESSAGE_ACTION_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: CONTROL_MESSAGE_ACTION_DISABLE_INPUT = 1;
     */
    DISABLE_INPUT = 1,
    /**
     * @generated from enum value: CONTROL_MESSAGE_ACTION_ENABLE_INPUT = 2;
     */
    ENABLE_INPUT = 2
}
/**
 * Describes the enum tokagent.v1.ControlMessageAction.
 */
export declare const ControlMessageActionSchema: GenEnum<ControlMessageAction>;
//# sourceMappingURL=events_pb.d.ts.map