import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Content } from "./primitives_pb.js";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/agent.proto.
 */
export declare const file_tokagent_v1_agent: GenFile;
/**
 * Example message for demonstration
 *
 * @generated from message tokagent.v1.MessageExample
 */
export type MessageExample = Message<"tokagent.v1.MessageExample"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: tokagent.v1.Content content = 2;
     */
    content?: Content;
};
/**
 * Describes the message tokagent.v1.MessageExample.
 * Use `create(MessageExampleSchema)` to create a new message.
 */
export declare const MessageExampleSchema: GenMessage<MessageExample>;
/**
 * Knowledge item - can be a path or directory reference
 *
 * @generated from message tokagent.v1.KnowledgeItem
 */
export type KnowledgeItem = Message<"tokagent.v1.KnowledgeItem"> & {
    /**
     * @generated from oneof tokagent.v1.KnowledgeItem.item
     */
    item: {
        /**
         * @generated from field: string path = 1;
         */
        value: string;
        case: "path";
    } | {
        /**
         * @generated from field: tokagent.v1.KnowledgeDirectory directory = 2;
         */
        value: KnowledgeDirectory;
        case: "directory";
    } | {
        case: undefined;
        value?: undefined;
    };
};
/**
 * Describes the message tokagent.v1.KnowledgeItem.
 * Use `create(KnowledgeItemSchema)` to create a new message.
 */
export declare const KnowledgeItemSchema: GenMessage<KnowledgeItem>;
/**
 * Knowledge directory with optional shared flag
 *
 * @generated from message tokagent.v1.KnowledgeDirectory
 */
export type KnowledgeDirectory = Message<"tokagent.v1.KnowledgeDirectory"> & {
    /**
     * @generated from field: string path = 1;
     */
    path: string;
    /**
     * @generated from field: optional bool shared = 2;
     */
    shared?: boolean;
};
/**
 * Describes the message tokagent.v1.KnowledgeDirectory.
 * Use `create(KnowledgeDirectorySchema)` to create a new message.
 */
export declare const KnowledgeDirectorySchema: GenMessage<KnowledgeDirectory>;
/**
 * Character settings (well-known keys with expected types)
 *
 * @generated from message tokagent.v1.CharacterSettings
 */
export type CharacterSettings = Message<"tokagent.v1.CharacterSettings"> & {
    /**
     * Model type to use for shouldRespond evaluation
     *
     * "small" | "large"
     *
     * @generated from field: optional string should_respond_model = 1;
     */
    shouldRespondModel?: string;
    /**
     * Whether to use multi-step workflow
     *
     * @generated from field: optional bool use_multi_step = 2;
     */
    useMultiStep?: boolean;
    /**
     * Maximum iterations for multi-step
     *
     * @generated from field: optional int32 max_multistep_iterations = 3;
     */
    maxMultistepIterations?: number;
    /**
     * Whether LLM is off by default in rooms
     *
     * @generated from field: optional bool basic_capabilities_defllmoff = 4;
     */
    basicCapabilitiesDefllmoff?: boolean;
    /**
     * Whether to keep responses when superseded
     *
     * @generated from field: optional bool basic_capabilities_keep_resp = 5;
     */
    basicCapabilitiesKeepResp?: boolean;
    /**
     * Provider execution timeout in ms
     *
     * @generated from field: optional int32 providers_total_timeout_ms = 6;
     */
    providersTotalTimeoutMs?: number;
    /**
     * Maximum working memory entries
     *
     * @generated from field: optional int32 max_working_memory_entries = 7;
     */
    maxWorkingMemoryEntries?: number;
    /**
     * Channel types that always trigger response
     *
     * @generated from field: optional string always_respond_channels = 8;
     */
    alwaysRespondChannels?: string;
    /**
     * Sources that always trigger response
     *
     * @generated from field: optional string always_respond_sources = 9;
     */
    alwaysRespondSources?: string;
    /**
     * Model temperature
     *
     * @generated from field: optional double default_temperature = 10;
     */
    defaultTemperature?: number;
    /**
     * Maximum tokens for text generation
     *
     * @generated from field: optional int32 default_max_tokens = 11;
     */
    defaultMaxTokens?: number;
    /**
     * Frequency penalty
     *
     * @generated from field: optional double default_frequency_penalty = 12;
     */
    defaultFrequencyPenalty?: number;
    /**
     * Presence penalty
     *
     * @generated from field: optional double default_presence_penalty = 13;
     */
    defaultPresencePenalty?: number;
    /**
     * Disable basic capabilities
     *
     * @generated from field: optional bool disable_basic_capabilities = 14;
     */
    disableBasicCapabilities?: boolean;
    /**
     * Enable extended capabilities
     *
     * @generated from field: optional bool enable_extended_capabilities = 15;
     */
    enableExtendedCapabilities?: boolean;
    /**
     * Additional dynamic settings
     *
     * @generated from field: google.protobuf.Struct extra = 16;
     */
    extra?: JsonObject;
    /**
     * Enable native knowledge runtime feature
     *
     * @generated from field: optional bool enable_knowledge = 17;
     */
    enableKnowledge?: boolean;
    /**
     * Enable native relationships runtime feature
     *
     * @generated from field: optional bool enable_relationships = 18;
     */
    enableRelationships?: boolean;
    /**
     * Enable native trajectories runtime feature
     *
     * @generated from field: optional bool enable_trajectories = 19;
     */
    enableTrajectories?: boolean;
};
/**
 * Describes the message tokagent.v1.CharacterSettings.
 * Use `create(CharacterSettingsSchema)` to create a new message.
 */
export declare const CharacterSettingsSchema: GenMessage<CharacterSettings>;
/**
 * Writing style guides
 *
 * @generated from message tokagent.v1.StyleGuides
 */
export type StyleGuides = Message<"tokagent.v1.StyleGuides"> & {
    /**
     * @generated from field: repeated string all = 1;
     */
    all: string[];
    /**
     * @generated from field: repeated string chat = 2;
     */
    chat: string[];
    /**
     * @generated from field: repeated string post = 3;
     */
    post: string[];
};
/**
 * Describes the message tokagent.v1.StyleGuides.
 * Use `create(StyleGuidesSchema)` to create a new message.
 */
export declare const StyleGuidesSchema: GenMessage<StyleGuides>;
/**
 * Character configuration defining personality, knowledge, and capabilities
 *
 * @generated from message tokagent.v1.Character
 */
export type Character = Message<"tokagent.v1.Character"> & {
    /**
     * @generated from field: optional string id = 1;
     */
    id?: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    /**
     * @generated from field: optional string username = 3;
     */
    username?: string;
    /**
     * @generated from field: optional string system = 4;
     */
    system?: string;
    /**
     * Templates as map of name to template string
     *
     * @generated from field: map<string, string> templates = 5;
     */
    templates: {
        [key: string]: string;
    };
    /**
     * Bio can be a single string or multiple lines
     *
     * @generated from field: repeated string bio = 6;
     */
    bio: string[];
    /**
     * Example messages grouped in arrays
     *
     * @generated from field: repeated tokagent.v1.MessageExampleGroup message_examples = 7;
     */
    messageExamples: MessageExampleGroup[];
    /**
     * @generated from field: repeated string post_examples = 8;
     */
    postExamples: string[];
    /**
     * @generated from field: repeated string topics = 9;
     */
    topics: string[];
    /**
     * @generated from field: repeated string adjectives = 10;
     */
    adjectives: string[];
    /**
     * @generated from field: repeated tokagent.v1.KnowledgeItem knowledge = 11;
     */
    knowledge: KnowledgeItem[];
    /**
     * @generated from field: repeated string plugins = 12;
     */
    plugins: string[];
    /**
     * @generated from field: optional tokagent.v1.CharacterSettings settings = 13;
     */
    settings?: CharacterSettings;
    /**
     * Secrets as key-value pairs
     *
     * @generated from field: map<string, string> secrets = 14;
     */
    secrets: {
        [key: string]: string;
    };
    /**
     * @generated from field: optional tokagent.v1.StyleGuides style = 15;
     */
    style?: StyleGuides;
    /**
     * Enable built-in advanced planning capabilities
     *
     * @generated from field: optional bool advanced_planning = 16;
     */
    advancedPlanning?: boolean;
    /**
     * Enable built-in advanced memory capabilities
     *
     * @generated from field: optional bool advanced_memory = 17;
     */
    advancedMemory?: boolean;
};
/**
 * Describes the message tokagent.v1.Character.
 * Use `create(CharacterSchema)` to create a new message.
 */
export declare const CharacterSchema: GenMessage<Character>;
/**
 * Group of message examples (for nested array structure)
 *
 * @generated from message tokagent.v1.MessageExampleGroup
 */
export type MessageExampleGroup = Message<"tokagent.v1.MessageExampleGroup"> & {
    /**
     * @generated from field: repeated tokagent.v1.MessageExample examples = 1;
     */
    examples: MessageExample[];
};
/**
 * Describes the message tokagent.v1.MessageExampleGroup.
 * Use `create(MessageExampleGroupSchema)` to create a new message.
 */
export declare const MessageExampleGroupSchema: GenMessage<MessageExampleGroup>;
/**
 * Represents an operational agent
 *
 * @generated from message tokagent.v1.Agent
 */
export type Agent = Message<"tokagent.v1.Agent"> & {
    /**
     * Inherits all Character fields
     *
     * @generated from field: tokagent.v1.Character character = 1;
     */
    character?: Character;
    /**
     * @generated from field: optional bool enabled = 2;
     */
    enabled?: boolean;
    /**
     * @generated from field: tokagent.v1.AgentStatus status = 3;
     */
    status: AgentStatus;
    /**
     * @generated from field: int64 created_at = 4;
     */
    createdAt: bigint;
    /**
     * @generated from field: int64 updated_at = 5;
     */
    updatedAt: bigint;
};
/**
 * Describes the message tokagent.v1.Agent.
 * Use `create(AgentSchema)` to create a new message.
 */
export declare const AgentSchema: GenMessage<Agent>;
/**
 * Agent status enumeration
 *
 * @generated from enum tokagent.v1.AgentStatus
 */
export declare enum AgentStatus {
    /**
     * @generated from enum value: AGENT_STATUS_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: AGENT_STATUS_ACTIVE = 1;
     */
    ACTIVE = 1,
    /**
     * @generated from enum value: AGENT_STATUS_INACTIVE = 2;
     */
    INACTIVE = 2
}
/**
 * Describes the enum tokagent.v1.AgentStatus.
 */
export declare const AgentStatusSchema: GenEnum<AgentStatus>;
//# sourceMappingURL=agent_pb.d.ts.map