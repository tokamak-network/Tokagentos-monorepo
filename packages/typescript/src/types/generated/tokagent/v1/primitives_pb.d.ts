import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/primitives.proto.
 */
export declare const file_tokagent_v1_primitives: GenFile;
/**
 * UUID string type (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 * Note: Proto doesn't have a native UUID type, so we use string
 * Validation should be done at the application layer
 *
 * @generated from message tokagent.v1.UUID
 */
export type UUID = Message<"tokagent.v1.UUID"> & {
    /**
     * @generated from field: string value = 1;
     */
    value: string;
};
/**
 * Describes the message tokagent.v1.UUID.
 * Use `create(UUIDSchema)` to create a new message.
 */
export declare const UUIDSchema: GenMessage<UUID>;
/**
 * The default/nil UUID used when no room or world is specified
 * Value: 00000000-0000-0000-0000-000000000000
 * Using a constant message pattern for language interop
 *
 * @generated from message tokagent.v1.DefaultUUID
 */
export type DefaultUUID = Message<"tokagent.v1.DefaultUUID"> & {
    /**
     * Always "00000000-0000-0000-0000-000000000000"
     *
     * @generated from field: string value = 1;
     */
    value: string;
};
/**
 * Describes the message tokagent.v1.DefaultUUID.
 * Use `create(DefaultUUIDSchema)` to create a new message.
 */
export declare const DefaultUUIDSchema: GenMessage<DefaultUUID>;
/**
 * Represents a media attachment
 *
 * @generated from message tokagent.v1.Media
 */
export type Media = Message<"tokagent.v1.Media"> & {
    /**
     * Unique identifier
     *
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * Media URL
     *
     * @generated from field: string url = 2;
     */
    url: string;
    /**
     * Media title
     *
     * @generated from field: optional string title = 3;
     */
    title?: string;
    /**
     * Media source
     *
     * @generated from field: optional string source = 4;
     */
    source?: string;
    /**
     * Media description
     *
     * @generated from field: optional string description = 5;
     */
    description?: string;
    /**
     * Text content
     *
     * @generated from field: optional string text = 6;
     */
    text?: string;
    /**
     * Content type (e.g. "image", "video", "audio", "document", "link")
     *
     * @generated from field: optional string content_type = 7;
     */
    contentType?: string;
};
/**
 * Describes the message tokagent.v1.Media.
 * Use `create(MediaSchema)` to create a new message.
 */
export declare const MediaSchema: GenMessage<Media>;
/**
 * Platform-provided metadata about mentions
 * Contains ONLY technical facts from the platform API
 *
 * @generated from message tokagent.v1.MentionContext
 */
export type MentionContext = Message<"tokagent.v1.MentionContext"> & {
    /**
     * Platform native mention (@Discord, @Telegram, etc.)
     *
     * @generated from field: bool is_mention = 1;
     */
    isMention: boolean;
    /**
     * Reply to agent's message
     *
     * @generated from field: bool is_reply = 2;
     */
    isReply: boolean;
    /**
     * In a thread with agent
     *
     * @generated from field: bool is_thread = 3;
     */
    isThread: boolean;
    /**
     * Platform-specific mention type for debugging/logging
     *
     * "platform_mention" | "reply" | "thread" | "none"
     *
     * @generated from field: optional string mention_type = 4;
     */
    mentionType?: string;
};
/**
 * Describes the message tokagent.v1.MentionContext.
 * Use `create(MentionContextSchema)` to create a new message.
 */
export declare const MentionContextSchema: GenMessage<MentionContext>;
/**
 * Represents the content of a memory, message, or other information.
 * Primary data structure for messages exchanged between users, agents, and the system.
 *
 * @generated from message tokagent.v1.Content
 */
export type Content = Message<"tokagent.v1.Content"> & {
    /**
     * The agent's internal thought process
     *
     * @generated from field: optional string thought = 1;
     */
    thought?: string;
    /**
     * The main text content visible to users
     *
     * @generated from field: optional string text = 2;
     */
    text?: string;
    /**
     * Actions to be performed
     *
     * @generated from field: repeated string actions = 3;
     */
    actions: string[];
    /**
     * Providers to use for context generation
     *
     * @generated from field: repeated string providers = 4;
     */
    providers: string[];
    /**
     * Source/origin of the content (e.g., 'discord', 'telegram')
     *
     * @generated from field: optional string source = 5;
     */
    source?: string;
    /**
     * Target/destination for responses
     *
     * @generated from field: optional string target = 6;
     */
    target?: string;
    /**
     * URL of the original message/post
     *
     * @generated from field: optional string url = 7;
     */
    url?: string;
    /**
     * UUID of parent message if this is a reply/thread
     *
     * @generated from field: optional string in_reply_to = 8;
     */
    inReplyTo?: string;
    /**
     * Array of media attachments
     *
     * @generated from field: repeated tokagent.v1.Media attachments = 9;
     */
    attachments: Media[];
    /**
     * Channel type where this content was sent
     *
     * @generated from field: optional string channel_type = 10;
     */
    channelType?: string;
    /**
     * Platform-provided metadata about mentions
     *
     * @generated from field: optional tokagent.v1.MentionContext mention_context = 11;
     */
    mentionContext?: MentionContext;
    /**
     * Internal message ID used for streaming coordination
     *
     * @generated from field: optional string response_message_id = 12;
     */
    responseMessageId?: string;
    /**
     * Response ID for message tracking
     *
     * @generated from field: optional string response_id = 13;
     */
    responseId?: string;
    /**
     * Whether this is a simple response (no actions required)
     *
     * @generated from field: optional bool simple = 14;
     */
    simple?: boolean;
    /**
     * Type marker for internal use
     *
     * @generated from field: optional string type = 15;
     */
    type?: string;
    /**
     * Additional dynamic properties for plugin extensions
     *
     * @generated from field: google.protobuf.Struct data = 16;
     */
    data?: JsonObject;
};
/**
 * Describes the message tokagent.v1.Content.
 * Use `create(ContentSchema)` to create a new message.
 */
export declare const ContentSchema: GenMessage<Content>;
/**
 * Generic metadata type (JSON-serializable key-value pairs)
 *
 * @generated from message tokagent.v1.Metadata
 */
export type Metadata = Message<"tokagent.v1.Metadata"> & {
    /**
     * @generated from field: google.protobuf.Struct values = 1;
     */
    values?: JsonObject;
};
/**
 * Describes the message tokagent.v1.Metadata.
 * Use `create(MetadataSchema)` to create a new message.
 */
export declare const MetadataSchema: GenMessage<Metadata>;
//# sourceMappingURL=primitives_pb.d.ts.map