import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { MemoryMetadata } from "./memory_pb.js";
import type { Content } from "./primitives_pb.js";
import type { Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/knowledge.proto.
 */
export declare const file_tokagent_v1_knowledge: GenFile;
/**
 * Represents a single item of knowledge stored by the agent.
 *
 * @generated from message tokagent.v1.KnowledgeRecord
 */
export type KnowledgeRecord = Message<"tokagent.v1.KnowledgeRecord"> & {
    /**
     * Unique identifier for the knowledge item (UUID string).
     *
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * Content of the knowledge item.
     *
     * @generated from field: tokagent.v1.Content content = 2;
     */
    content?: Content;
    /**
     * Optional metadata associated with this knowledge item.
     *
     * @generated from field: optional tokagent.v1.MemoryMetadata metadata = 3;
     */
    metadata?: MemoryMetadata;
};
/**
 * Describes the message tokagent.v1.KnowledgeRecord.
 * Use `create(KnowledgeRecordSchema)` to create a new message.
 */
export declare const KnowledgeRecordSchema: GenMessage<KnowledgeRecord>;
/**
 * Directory-based knowledge source configuration.
 *
 * @generated from message tokagent.v1.DirectoryItem
 */
export type DirectoryItem = Message<"tokagent.v1.DirectoryItem"> & {
    /**
     * Path to a directory containing knowledge files.
     *
     * @generated from field: string directory = 1;
     */
    directory: string;
    /**
     * Whether this knowledge is shared across characters.
     *
     * @generated from field: optional bool shared = 2;
     */
    shared?: boolean;
};
/**
 * Describes the message tokagent.v1.DirectoryItem.
 * Use `create(DirectoryItemSchema)` to create a new message.
 */
export declare const DirectoryItemSchema: GenMessage<DirectoryItem>;
//# sourceMappingURL=knowledge_pb.d.ts.map