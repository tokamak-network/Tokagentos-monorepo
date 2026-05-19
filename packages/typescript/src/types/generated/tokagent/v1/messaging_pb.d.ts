import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Memory } from "./memory_pb.js";
import type { Content } from "./primitives_pb.js";
import type { Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/messaging.proto.
 */
export declare const file_tokagent_v1_messaging: GenFile;
/**
 * Target information for message routing
 *
 * @generated from message tokagent.v1.TargetInfo
 */
export type TargetInfo = Message<"tokagent.v1.TargetInfo"> & {
    /**
     * @generated from field: string source = 1;
     */
    source: string;
    /**
     * @generated from field: optional string room_id = 2;
     */
    roomId?: string;
    /**
     * @generated from field: optional string channel_id = 3;
     */
    channelId?: string;
    /**
     * @generated from field: optional string server_id = 4;
     */
    serverId?: string;
    /**
     * @generated from field: optional string entity_id = 5;
     */
    entityId?: string;
    /**
     * @generated from field: optional string thread_id = 6;
     */
    threadId?: string;
};
/**
 * Describes the message tokagent.v1.TargetInfo.
 * Use `create(TargetInfoSchema)` to create a new message.
 */
export declare const TargetInfoSchema: GenMessage<TargetInfo>;
/**
 * Message stream chunk payload
 *
 * @generated from message tokagent.v1.MessageStreamChunkPayload
 */
export type MessageStreamChunkPayload = Message<"tokagent.v1.MessageStreamChunkPayload"> & {
    /**
     * @generated from field: string message_id = 1;
     */
    messageId: string;
    /**
     * @generated from field: string chunk = 2;
     */
    chunk: string;
    /**
     * @generated from field: int32 index = 3;
     */
    index: number;
    /**
     * @generated from field: string channel_id = 4;
     */
    channelId: string;
    /**
     * @generated from field: string agent_id = 5;
     */
    agentId: string;
};
/**
 * Describes the message tokagent.v1.MessageStreamChunkPayload.
 * Use `create(MessageStreamChunkPayloadSchema)` to create a new message.
 */
export declare const MessageStreamChunkPayloadSchema: GenMessage<MessageStreamChunkPayload>;
/**
 * Message stream error payload
 *
 * @generated from message tokagent.v1.MessageStreamErrorPayload
 */
export type MessageStreamErrorPayload = Message<"tokagent.v1.MessageStreamErrorPayload"> & {
    /**
     * @generated from field: string message_id = 1;
     */
    messageId: string;
    /**
     * @generated from field: string channel_id = 2;
     */
    channelId: string;
    /**
     * @generated from field: string agent_id = 3;
     */
    agentId: string;
    /**
     * @generated from field: string error = 4;
     */
    error: string;
    /**
     * @generated from field: optional string partial_text = 5;
     */
    partialText?: string;
};
/**
 * Describes the message tokagent.v1.MessageStreamErrorPayload.
 * Use `create(MessageStreamErrorPayloadSchema)` to create a new message.
 */
export declare const MessageStreamErrorPayloadSchema: GenMessage<MessageStreamErrorPayload>;
/**
 * Handler options for async message processing
 *
 * Note: Callbacks cannot be represented in proto
 * These should be handled at the application layer
 *
 * @generated from message tokagent.v1.MessageHandlerOptions
 */
export type MessageHandlerOptions = Message<"tokagent.v1.MessageHandlerOptions"> & {};
/**
 * Describes the message tokagent.v1.MessageHandlerOptions.
 * Use `create(MessageHandlerOptionsSchema)` to create a new message.
 */
export declare const MessageHandlerOptionsSchema: GenMessage<MessageHandlerOptions>;
/**
 * Result of sending a message to an agent
 *
 * @generated from message tokagent.v1.MessageResult
 */
export type MessageResult = Message<"tokagent.v1.MessageResult"> & {
    /**
     * @generated from field: string message_id = 1;
     */
    messageId: string;
    /**
     * @generated from field: optional tokagent.v1.Memory user_message = 2;
     */
    userMessage?: Memory;
    /**
     * @generated from field: repeated tokagent.v1.Content agent_responses = 3;
     */
    agentResponses: Content[];
    /**
     * @generated from field: optional tokagent.v1.MessageUsage usage = 4;
     */
    usage?: MessageUsage;
};
/**
 * Describes the message tokagent.v1.MessageResult.
 * Use `create(MessageResultSchema)` to create a new message.
 */
export declare const MessageResultSchema: GenMessage<MessageResult>;
/**
 * Usage information for billing
 *
 * @generated from message tokagent.v1.MessageUsage
 */
export type MessageUsage = Message<"tokagent.v1.MessageUsage"> & {
    /**
     * @generated from field: int32 input_tokens = 1;
     */
    inputTokens: number;
    /**
     * @generated from field: int32 output_tokens = 2;
     */
    outputTokens: number;
    /**
     * @generated from field: string model = 3;
     */
    model: string;
};
/**
 * Describes the message tokagent.v1.MessageUsage.
 * Use `create(MessageUsageSchema)` to create a new message.
 */
export declare const MessageUsageSchema: GenMessage<MessageUsage>;
/**
 * Socket message type enumeration
 *
 * @generated from enum tokagent.v1.SocketMessageType
 */
export declare enum SocketMessageType {
    /**
     * @generated from enum value: SOCKET_MESSAGE_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: SOCKET_MESSAGE_TYPE_ROOM_JOINING = 1;
     */
    ROOM_JOINING = 1,
    /**
     * @generated from enum value: SOCKET_MESSAGE_TYPE_SEND_MESSAGE = 2;
     */
    SEND_MESSAGE = 2,
    /**
     * @generated from enum value: SOCKET_MESSAGE_TYPE_MESSAGE = 3;
     */
    MESSAGE = 3,
    /**
     * @generated from enum value: SOCKET_MESSAGE_TYPE_ACK = 4;
     */
    ACK = 4,
    /**
     * @generated from enum value: SOCKET_MESSAGE_TYPE_THINKING = 5;
     */
    THINKING = 5,
    /**
     * @generated from enum value: SOCKET_MESSAGE_TYPE_CONTROL = 6;
     */
    CONTROL = 6
}
/**
 * Describes the enum tokagent.v1.SocketMessageType.
 */
export declare const SocketMessageTypeSchema: GenEnum<SocketMessageType>;
//# sourceMappingURL=messaging_pb.d.ts.map