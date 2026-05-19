import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Content } from "./primitives_pb.js";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/memory.proto.
 */
export declare const file_tokagent_v1_memory: GenFile;
/**
 * Base memory metadata
 *
 * @generated from message tokagent.v1.BaseMetadata
 */
export type BaseMetadata = Message<"tokagent.v1.BaseMetadata"> & {
    /**
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: optional string source = 2;
     */
    source?: string;
    /**
     * @generated from field: optional string source_id = 3;
     */
    sourceId?: string;
    /**
     * @generated from field: optional string scope = 4;
     */
    scope?: string;
    /**
     * @generated from field: optional int64 timestamp = 5;
     */
    timestamp?: bigint;
    /**
     * @generated from field: repeated string tags = 6;
     */
    tags: string[];
};
/**
 * Describes the message tokagent.v1.BaseMetadata.
 * Use `create(BaseMetadataSchema)` to create a new message.
 */
export declare const BaseMetadataSchema: GenMessage<BaseMetadata>;
/**
 * Document-specific metadata
 *
 * @generated from message tokagent.v1.DocumentMetadata
 */
export type DocumentMetadata = Message<"tokagent.v1.DocumentMetadata"> & {
    /**
     * @generated from field: tokagent.v1.BaseMetadata base = 1;
     */
    base?: BaseMetadata;
};
/**
 * Describes the message tokagent.v1.DocumentMetadata.
 * Use `create(DocumentMetadataSchema)` to create a new message.
 */
export declare const DocumentMetadataSchema: GenMessage<DocumentMetadata>;
/**
 * Fragment-specific metadata
 *
 * @generated from message tokagent.v1.FragmentMetadata
 */
export type FragmentMetadata = Message<"tokagent.v1.FragmentMetadata"> & {
    /**
     * @generated from field: tokagent.v1.BaseMetadata base = 1;
     */
    base?: BaseMetadata;
    /**
     * @generated from field: string document_id = 2;
     */
    documentId: string;
    /**
     * @generated from field: int32 position = 3;
     */
    position: number;
};
/**
 * Describes the message tokagent.v1.FragmentMetadata.
 * Use `create(FragmentMetadataSchema)` to create a new message.
 */
export declare const FragmentMetadataSchema: GenMessage<FragmentMetadata>;
/**
 * Message-specific metadata
 *
 * @generated from message tokagent.v1.MessageMetadata
 */
export type MessageMetadata = Message<"tokagent.v1.MessageMetadata"> & {
    /**
     * @generated from field: tokagent.v1.BaseMetadata base = 1;
     */
    base?: BaseMetadata;
    /**
     * @generated from field: optional string trajectory_step_id = 2;
     */
    trajectoryStepId?: string;
    /**
     * @generated from field: optional string benchmark_context = 3;
     */
    benchmarkContext?: string;
};
/**
 * Describes the message tokagent.v1.MessageMetadata.
 * Use `create(MessageMetadataSchema)` to create a new message.
 */
export declare const MessageMetadataSchema: GenMessage<MessageMetadata>;
/**
 * Description-specific metadata
 *
 * @generated from message tokagent.v1.DescriptionMetadata
 */
export type DescriptionMetadata = Message<"tokagent.v1.DescriptionMetadata"> & {
    /**
     * @generated from field: tokagent.v1.BaseMetadata base = 1;
     */
    base?: BaseMetadata;
};
/**
 * Describes the message tokagent.v1.DescriptionMetadata.
 * Use `create(DescriptionMetadataSchema)` to create a new message.
 */
export declare const DescriptionMetadataSchema: GenMessage<DescriptionMetadata>;
/**
 * Custom metadata with dynamic properties
 *
 * @generated from message tokagent.v1.CustomMetadata
 */
export type CustomMetadata = Message<"tokagent.v1.CustomMetadata"> & {
    /**
     * @generated from field: tokagent.v1.BaseMetadata base = 1;
     */
    base?: BaseMetadata;
    /**
     * @generated from field: google.protobuf.Struct custom_data = 2;
     */
    customData?: JsonObject;
};
/**
 * Describes the message tokagent.v1.CustomMetadata.
 * Use `create(CustomMetadataSchema)` to create a new message.
 */
export declare const CustomMetadataSchema: GenMessage<CustomMetadata>;
/**
 * Union of all memory metadata types
 *
 * @generated from message tokagent.v1.MemoryMetadata
 */
export type MemoryMetadata = Message<"tokagent.v1.MemoryMetadata"> & {
    /**
     * @generated from oneof tokagent.v1.MemoryMetadata.metadata
     */
    metadata: {
        /**
         * @generated from field: tokagent.v1.DocumentMetadata document = 1;
         */
        value: DocumentMetadata;
        case: "document";
    } | {
        /**
         * @generated from field: tokagent.v1.FragmentMetadata fragment = 2;
         */
        value: FragmentMetadata;
        case: "fragment";
    } | {
        /**
         * @generated from field: tokagent.v1.MessageMetadata message = 3;
         */
        value: MessageMetadata;
        case: "message";
    } | {
        /**
         * @generated from field: tokagent.v1.DescriptionMetadata description = 4;
         */
        value: DescriptionMetadata;
        case: "description";
    } | {
        /**
         * @generated from field: tokagent.v1.CustomMetadata custom = 5;
         */
        value: CustomMetadata;
        case: "custom";
    } | {
        case: undefined;
        value?: undefined;
    };
};
/**
 * Describes the message tokagent.v1.MemoryMetadata.
 * Use `create(MemoryMetadataSchema)` to create a new message.
 */
export declare const MemoryMetadataSchema: GenMessage<MemoryMetadata>;
/**
 * Represents a stored memory/message
 *
 * @generated from message tokagent.v1.Memory
 */
export type Memory = Message<"tokagent.v1.Memory"> & {
    /**
     * Optional unique identifier
     *
     * @generated from field: optional string id = 1;
     */
    id?: string;
    /**
     * Associated entity ID
     *
     * @generated from field: string entity_id = 2;
     */
    entityId: string;
    /**
     * Associated agent ID
     *
     * @generated from field: optional string agent_id = 3;
     */
    agentId?: string;
    /**
     * Optional creation timestamp in milliseconds since epoch
     *
     * @generated from field: optional int64 created_at = 4;
     */
    createdAt?: bigint;
    /**
     * Memory content
     *
     * @generated from field: tokagent.v1.Content content = 5;
     */
    content?: Content;
    /**
     * Optional embedding vector for semantic search
     *
     * @generated from field: repeated float embedding = 6;
     */
    embedding: number[];
    /**
     * Associated room ID
     *
     * @generated from field: string room_id = 7;
     */
    roomId: string;
    /**
     * Associated world ID (optional)
     *
     * @generated from field: optional string world_id = 8;
     */
    worldId?: string;
    /**
     * Whether memory is unique (used to prevent duplicates)
     *
     * @generated from field: optional bool unique = 9;
     */
    unique?: boolean;
    /**
     * Embedding similarity score (set when retrieved via search)
     *
     * @generated from field: optional float similarity = 10;
     */
    similarity?: number;
    /**
     * Metadata for the memory
     *
     * @generated from field: optional tokagent.v1.MemoryMetadata metadata = 11;
     */
    metadata?: MemoryMetadata;
};
/**
 * Describes the message tokagent.v1.Memory.
 * Use `create(MemorySchema)` to create a new message.
 */
export declare const MemorySchema: GenMessage<Memory>;
/**
 * Specialized memory type for messages with enhanced type checking
 *
 * @generated from message tokagent.v1.MessageMemory
 */
export type MessageMemory = Message<"tokagent.v1.MessageMemory"> & {
    /**
     * Note: In proto, we can't enforce that content.text is required
     * This should be validated at the application layer
     *
     * @generated from field: tokagent.v1.Memory memory = 1;
     */
    memory?: Memory;
};
/**
 * Describes the message tokagent.v1.MessageMemory.
 * Use `create(MessageMemorySchema)` to create a new message.
 */
export declare const MessageMemorySchema: GenMessage<MessageMemory>;
//# sourceMappingURL=memory_pb.d.ts.map