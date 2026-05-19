import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { MemoryMetadata } from "./memory_pb.js";
import type { Timestamp, Value } from "@bufbuild/protobuf/wkt";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/database.proto.
 */
export declare const file_tokagent_v1_database: GenFile;
/**
 * Base log body type
 *
 * @generated from message tokagent.v1.BaseLogBody
 */
export type BaseLogBody = Message<"tokagent.v1.BaseLogBody"> & {
    /**
     * @generated from field: optional string run_id = 1;
     */
    runId?: string;
    /**
     * @generated from field: optional string parent_run_id = 2;
     */
    parentRunId?: string;
    /**
     * @generated from field: optional string status = 3;
     */
    status?: string;
    /**
     * @generated from field: optional string message_id = 4;
     */
    messageId?: string;
    /**
     * @generated from field: optional string room_id = 5;
     */
    roomId?: string;
    /**
     * @generated from field: optional string entity_id = 6;
     */
    entityId?: string;
    /**
     * @generated from field: google.protobuf.Struct metadata = 7;
     */
    metadata?: JsonObject;
};
/**
 * Describes the message tokagent.v1.BaseLogBody.
 * Use `create(BaseLogBodySchema)` to create a new message.
 */
export declare const BaseLogBodySchema: GenMessage<BaseLogBody>;
/**
 * Action log content structure
 *
 * @generated from message tokagent.v1.ActionLogContent
 */
export type ActionLogContent = Message<"tokagent.v1.ActionLogContent"> & {
    /**
     * @generated from field: repeated string actions = 1;
     */
    actions: string[];
    /**
     * @generated from field: optional string text = 2;
     */
    text?: string;
    /**
     * @generated from field: optional string thought = 3;
     */
    thought?: string;
};
/**
 * Describes the message tokagent.v1.ActionLogContent.
 * Use `create(ActionLogContentSchema)` to create a new message.
 */
export declare const ActionLogContentSchema: GenMessage<ActionLogContent>;
/**
 * Action result for logging
 *
 * @generated from message tokagent.v1.ActionLogResult
 */
export type ActionLogResult = Message<"tokagent.v1.ActionLogResult"> & {
    /**
     * @generated from field: optional bool success = 1;
     */
    success?: boolean;
    /**
     * @generated from field: google.protobuf.Struct data = 2;
     */
    data?: JsonObject;
    /**
     * @generated from field: optional string text = 3;
     */
    text?: string;
    /**
     * @generated from field: optional string error = 4;
     */
    error?: string;
};
/**
 * Describes the message tokagent.v1.ActionLogResult.
 * Use `create(ActionLogResultSchema)` to create a new message.
 */
export declare const ActionLogResultSchema: GenMessage<ActionLogResult>;
/**
 * Prompt tracking for action logs
 *
 * @generated from message tokagent.v1.ActionLogPrompt
 */
export type ActionLogPrompt = Message<"tokagent.v1.ActionLogPrompt"> & {
    /**
     * @generated from field: string model_type = 1;
     */
    modelType: string;
    /**
     * @generated from field: string prompt = 2;
     */
    prompt: string;
    /**
     * @generated from field: int64 timestamp = 3;
     */
    timestamp: bigint;
};
/**
 * Describes the message tokagent.v1.ActionLogPrompt.
 * Use `create(ActionLogPromptSchema)` to create a new message.
 */
export declare const ActionLogPromptSchema: GenMessage<ActionLogPrompt>;
/**
 * Action log body
 *
 * @generated from message tokagent.v1.ActionLogBody
 */
export type ActionLogBody = Message<"tokagent.v1.ActionLogBody"> & {
    /**
     * @generated from field: tokagent.v1.BaseLogBody base = 1;
     */
    base?: BaseLogBody;
    /**
     * @generated from field: optional string action = 2;
     */
    action?: string;
    /**
     * @generated from field: optional string action_id = 3;
     */
    actionId?: string;
    /**
     * @generated from field: optional string message = 4;
     */
    message?: string;
    /**
     * @generated from field: google.protobuf.Struct state = 5;
     */
    state?: JsonObject;
    /**
     * @generated from field: repeated google.protobuf.Struct responses = 6;
     */
    responses: JsonObject[];
    /**
     * @generated from field: optional tokagent.v1.ActionLogContent content = 7;
     */
    content?: ActionLogContent;
    /**
     * @generated from field: optional tokagent.v1.ActionLogResult result = 8;
     */
    result?: ActionLogResult;
    /**
     * @generated from field: repeated tokagent.v1.ActionLogPrompt prompts = 9;
     */
    prompts: ActionLogPrompt[];
    /**
     * @generated from field: optional int32 prompt_count = 11;
     */
    promptCount?: number;
    /**
     * @generated from field: optional string plan_step = 12;
     */
    planStep?: string;
    /**
     * @generated from field: optional string plan_thought = 13;
     */
    planThought?: string;
};
/**
 * Describes the message tokagent.v1.ActionLogBody.
 * Use `create(ActionLogBodySchema)` to create a new message.
 */
export declare const ActionLogBodySchema: GenMessage<ActionLogBody>;
/**
 * Evaluator log body
 *
 * @generated from message tokagent.v1.EvaluatorLogBody
 */
export type EvaluatorLogBody = Message<"tokagent.v1.EvaluatorLogBody"> & {
    /**
     * @generated from field: tokagent.v1.BaseLogBody base = 1;
     */
    base?: BaseLogBody;
    /**
     * @generated from field: optional string evaluator = 2;
     */
    evaluator?: string;
    /**
     * @generated from field: optional string message = 3;
     */
    message?: string;
    /**
     * @generated from field: google.protobuf.Struct state = 4;
     */
    state?: JsonObject;
};
/**
 * Describes the message tokagent.v1.EvaluatorLogBody.
 * Use `create(EvaluatorLogBodySchema)` to create a new message.
 */
export declare const EvaluatorLogBodySchema: GenMessage<EvaluatorLogBody>;
/**
 * Model action context
 *
 * @generated from message tokagent.v1.ModelActionContext
 */
export type ModelActionContext = Message<"tokagent.v1.ModelActionContext"> & {
    /**
     * @generated from field: string action_name = 1;
     */
    actionName: string;
    /**
     * @generated from field: string action_id = 2;
     */
    actionId: string;
};
/**
 * Describes the message tokagent.v1.ModelActionContext.
 * Use `create(ModelActionContextSchema)` to create a new message.
 */
export declare const ModelActionContextSchema: GenMessage<ModelActionContext>;
/**
 * Model log body
 *
 * @generated from message tokagent.v1.ModelLogBody
 */
export type ModelLogBody = Message<"tokagent.v1.ModelLogBody"> & {
    /**
     * @generated from field: tokagent.v1.BaseLogBody base = 1;
     */
    base?: BaseLogBody;
    /**
     * @generated from field: optional string model_type = 2;
     */
    modelType?: string;
    /**
     * @generated from field: optional string model_key = 3;
     */
    modelKey?: string;
    /**
     * @generated from field: google.protobuf.Struct params = 4;
     */
    params?: JsonObject;
    /**
     * @generated from field: optional string prompt = 5;
     */
    prompt?: string;
    /**
     * @generated from field: optional string system_prompt = 6;
     */
    systemPrompt?: string;
    /**
     * @generated from field: optional int64 timestamp = 7;
     */
    timestamp?: bigint;
    /**
     * @generated from field: optional int64 execution_time = 8;
     */
    executionTime?: bigint;
    /**
     * @generated from field: optional string provider = 9;
     */
    provider?: string;
    /**
     * @generated from field: optional tokagent.v1.ModelActionContext action_context = 10;
     */
    actionContext?: ModelActionContext;
    /**
     * @generated from field: google.protobuf.Value response = 11;
     */
    response?: Value;
};
/**
 * Describes the message tokagent.v1.ModelLogBody.
 * Use `create(ModelLogBodySchema)` to create a new message.
 */
export declare const ModelLogBodySchema: GenMessage<ModelLogBody>;
/**
 * Embedding log body
 *
 * @generated from message tokagent.v1.EmbeddingLogBody
 */
export type EmbeddingLogBody = Message<"tokagent.v1.EmbeddingLogBody"> & {
    /**
     * @generated from field: tokagent.v1.BaseLogBody base = 1;
     */
    base?: BaseLogBody;
    /**
     * @generated from field: optional string memory_id = 2;
     */
    memoryId?: string;
    /**
     * @generated from field: optional int64 duration = 3;
     */
    duration?: bigint;
};
/**
 * Describes the message tokagent.v1.EmbeddingLogBody.
 * Use `create(EmbeddingLogBodySchema)` to create a new message.
 */
export declare const EmbeddingLogBodySchema: GenMessage<EmbeddingLogBody>;
/**
 * Union of all log body types
 *
 * @generated from message tokagent.v1.LogBody
 */
export type LogBody = Message<"tokagent.v1.LogBody"> & {
    /**
     * @generated from oneof tokagent.v1.LogBody.body
     */
    body: {
        /**
         * @generated from field: tokagent.v1.BaseLogBody base = 1;
         */
        value: BaseLogBody;
        case: "base";
    } | {
        /**
         * @generated from field: tokagent.v1.ActionLogBody action = 2;
         */
        value: ActionLogBody;
        case: "action";
    } | {
        /**
         * @generated from field: tokagent.v1.EvaluatorLogBody evaluator = 3;
         */
        value: EvaluatorLogBody;
        case: "evaluator";
    } | {
        /**
         * @generated from field: tokagent.v1.ModelLogBody model = 4;
         */
        value: ModelLogBody;
        case: "model";
    } | {
        /**
         * @generated from field: tokagent.v1.EmbeddingLogBody embedding = 5;
         */
        value: EmbeddingLogBody;
        case: "embedding";
    } | {
        case: undefined;
        value?: undefined;
    };
};
/**
 * Describes the message tokagent.v1.LogBody.
 * Use `create(LogBodySchema)` to create a new message.
 */
export declare const LogBodySchema: GenMessage<LogBody>;
/**
 * Log entry
 *
 * @generated from message tokagent.v1.Log
 */
export type Log = Message<"tokagent.v1.Log"> & {
    /**
     * @generated from field: optional string id = 1;
     */
    id?: string;
    /**
     * @generated from field: string entity_id = 2;
     */
    entityId: string;
    /**
     * @generated from field: optional string room_id = 3;
     */
    roomId?: string;
    /**
     * @generated from field: tokagent.v1.LogBody body = 4;
     */
    body?: LogBody;
    /**
     * @generated from field: string type = 5;
     */
    type: string;
    /**
     * @generated from field: google.protobuf.Timestamp created_at = 6;
     */
    createdAt?: Timestamp;
};
/**
 * Describes the message tokagent.v1.Log.
 * Use `create(LogSchema)` to create a new message.
 */
export declare const LogSchema: GenMessage<Log>;
/**
 * Agent run counts
 *
 * @generated from message tokagent.v1.AgentRunCounts
 */
export type AgentRunCounts = Message<"tokagent.v1.AgentRunCounts"> & {
    /**
     * @generated from field: int32 actions = 1;
     */
    actions: number;
    /**
     * @generated from field: int32 model_calls = 2;
     */
    modelCalls: number;
    /**
     * @generated from field: int32 errors = 3;
     */
    errors: number;
    /**
     * @generated from field: int32 evaluators = 4;
     */
    evaluators: number;
};
/**
 * Describes the message tokagent.v1.AgentRunCounts.
 * Use `create(AgentRunCountsSchema)` to create a new message.
 */
export declare const AgentRunCountsSchema: GenMessage<AgentRunCounts>;
/**
 * Agent run summary
 *
 * @generated from message tokagent.v1.AgentRunSummary
 */
export type AgentRunSummary = Message<"tokagent.v1.AgentRunSummary"> & {
    /**
     * @generated from field: string run_id = 1;
     */
    runId: string;
    /**
     * @generated from field: tokagent.v1.DbRunStatus status = 2;
     */
    status: DbRunStatus;
    /**
     * @generated from field: optional int64 started_at = 3;
     */
    startedAt?: bigint;
    /**
     * @generated from field: optional int64 ended_at = 4;
     */
    endedAt?: bigint;
    /**
     * @generated from field: optional int64 duration_ms = 5;
     */
    durationMs?: bigint;
    /**
     * @generated from field: optional string message_id = 6;
     */
    messageId?: string;
    /**
     * @generated from field: optional string room_id = 7;
     */
    roomId?: string;
    /**
     * @generated from field: optional string entity_id = 8;
     */
    entityId?: string;
    /**
     * @generated from field: google.protobuf.Struct metadata = 9;
     */
    metadata?: JsonObject;
    /**
     * @generated from field: optional tokagent.v1.AgentRunCounts counts = 10;
     */
    counts?: AgentRunCounts;
};
/**
 * Describes the message tokagent.v1.AgentRunSummary.
 * Use `create(AgentRunSummarySchema)` to create a new message.
 */
export declare const AgentRunSummarySchema: GenMessage<AgentRunSummary>;
/**
 * Agent run summary result
 *
 * @generated from message tokagent.v1.AgentRunSummaryResult
 */
export type AgentRunSummaryResult = Message<"tokagent.v1.AgentRunSummaryResult"> & {
    /**
     * @generated from field: repeated tokagent.v1.AgentRunSummary runs = 1;
     */
    runs: AgentRunSummary[];
    /**
     * @generated from field: int32 total = 2;
     */
    total: number;
    /**
     * @generated from field: bool has_more = 3;
     */
    hasMore: boolean;
};
/**
 * Describes the message tokagent.v1.AgentRunSummaryResult.
 * Use `create(AgentRunSummaryResultSchema)` to create a new message.
 */
export declare const AgentRunSummaryResultSchema: GenMessage<AgentRunSummaryResult>;
/**
 * Embedding search result
 *
 * @generated from message tokagent.v1.EmbeddingSearchResult
 */
export type EmbeddingSearchResult = Message<"tokagent.v1.EmbeddingSearchResult"> & {
    /**
     * @generated from field: repeated float embedding = 1;
     */
    embedding: number[];
    /**
     * @generated from field: int32 levenshtein_score = 2;
     */
    levenshteinScore: number;
};
/**
 * Describes the message tokagent.v1.EmbeddingSearchResult.
 * Use `create(EmbeddingSearchResultSchema)` to create a new message.
 */
export declare const EmbeddingSearchResultSchema: GenMessage<EmbeddingSearchResult>;
/**
 * Memory retrieval options
 *
 * @generated from message tokagent.v1.MemoryRetrievalOptions
 */
export type MemoryRetrievalOptions = Message<"tokagent.v1.MemoryRetrievalOptions"> & {
    /**
     * @generated from field: string room_id = 1;
     */
    roomId: string;
    /**
     * @generated from field: optional int32 count = 2;
     */
    count?: number;
    /**
     * @generated from field: optional bool unique = 3;
     */
    unique?: boolean;
    /**
     * @generated from field: optional int64 start = 4;
     */
    start?: bigint;
    /**
     * @generated from field: optional int64 end = 5;
     */
    end?: bigint;
    /**
     * @generated from field: optional string agent_id = 6;
     */
    agentId?: string;
};
/**
 * Describes the message tokagent.v1.MemoryRetrievalOptions.
 * Use `create(MemoryRetrievalOptionsSchema)` to create a new message.
 */
export declare const MemoryRetrievalOptionsSchema: GenMessage<MemoryRetrievalOptions>;
/**
 * Memory search options
 *
 * @generated from message tokagent.v1.MemorySearchOptions
 */
export type MemorySearchOptions = Message<"tokagent.v1.MemorySearchOptions"> & {
    /**
     * @generated from field: repeated float embedding = 1;
     */
    embedding: number[];
    /**
     * @generated from field: optional float match_threshold = 2;
     */
    matchThreshold?: number;
    /**
     * @generated from field: optional int32 count = 3;
     */
    count?: number;
    /**
     * @generated from field: string room_id = 4;
     */
    roomId: string;
    /**
     * @generated from field: optional string agent_id = 5;
     */
    agentId?: string;
    /**
     * @generated from field: optional bool unique = 6;
     */
    unique?: boolean;
    /**
     * @generated from field: optional tokagent.v1.MemoryMetadata metadata = 7;
     */
    metadata?: MemoryMetadata;
};
/**
 * Describes the message tokagent.v1.MemorySearchOptions.
 * Use `create(MemorySearchOptionsSchema)` to create a new message.
 */
export declare const MemorySearchOptionsSchema: GenMessage<MemorySearchOptions>;
/**
 * Multi-room memory options
 *
 * @generated from message tokagent.v1.MultiRoomMemoryOptions
 */
export type MultiRoomMemoryOptions = Message<"tokagent.v1.MultiRoomMemoryOptions"> & {
    /**
     * @generated from field: repeated string room_ids = 1;
     */
    roomIds: string[];
    /**
     * @generated from field: optional int32 limit = 2;
     */
    limit?: number;
    /**
     * @generated from field: optional string agent_id = 3;
     */
    agentId?: string;
};
/**
 * Describes the message tokagent.v1.MultiRoomMemoryOptions.
 * Use `create(MultiRoomMemoryOptionsSchema)` to create a new message.
 */
export declare const MultiRoomMemoryOptionsSchema: GenMessage<MultiRoomMemoryOptions>;
/**
 * Run status enumeration
 *
 * @generated from enum tokagent.v1.DbRunStatus
 */
export declare enum DbRunStatus {
    /**
     * @generated from enum value: DB_RUN_STATUS_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: DB_RUN_STATUS_STARTED = 1;
     */
    STARTED = 1,
    /**
     * @generated from enum value: DB_RUN_STATUS_COMPLETED = 2;
     */
    COMPLETED = 2,
    /**
     * @generated from enum value: DB_RUN_STATUS_TIMEOUT = 3;
     */
    TIMEOUT = 3,
    /**
     * @generated from enum value: DB_RUN_STATUS_ERROR = 4;
     */
    ERROR = 4
}
/**
 * Describes the enum tokagent.v1.DbRunStatus.
 */
export declare const DbRunStatusSchema: GenEnum<DbRunStatus>;
/**
 * Vector dimensions constants
 * Note: Proto doesn't have const, so this is just for documentation
 * SMALL: 384, MEDIUM: 512, LARGE: 768, XL: 1024, XXL: 1536, XXXL: 3072
 *
 * @generated from enum tokagent.v1.VectorDimension
 */
export declare enum VectorDimension {
    /**
     * @generated from enum value: VECTOR_DIMENSION_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: VECTOR_DIMENSION_SMALL = 384;
     */
    SMALL = 384,
    /**
     * @generated from enum value: VECTOR_DIMENSION_MEDIUM = 512;
     */
    MEDIUM = 512,
    /**
     * @generated from enum value: VECTOR_DIMENSION_LARGE = 768;
     */
    LARGE = 768,
    /**
     * @generated from enum value: VECTOR_DIMENSION_XL = 1024;
     */
    XL = 1024,
    /**
     * @generated from enum value: VECTOR_DIMENSION_XXL = 1536;
     */
    XXL = 1536,
    /**
     * @generated from enum value: VECTOR_DIMENSION_XXXL = 3072;
     */
    XXXL = 3072
}
/**
 * Describes the enum tokagent.v1.VectorDimension.
 */
export declare const VectorDimensionSchema: GenEnum<VectorDimension>;
//# sourceMappingURL=database_pb.d.ts.map