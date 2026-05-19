import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Memory } from "./memory_pb.js";
import type { Content } from "./primitives_pb.js";
import type { State } from "./state_pb.js";
import type { Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/message_service.proto.
 */
export declare const file_tokagent_v1_message_service: GenFile;
/**
 * Configuration options for message processing.
 *
 * @generated from message tokagent.v1.MessageProcessingOptions
 */
export type MessageProcessingOptions = Message<"tokagent.v1.MessageProcessingOptions"> & {
    /**
     * @generated from field: optional int32 max_retries = 1;
     */
    maxRetries?: number;
    /**
     * @generated from field: optional int64 timeout_duration = 2;
     */
    timeoutDuration?: bigint;
    /**
     * @generated from field: optional bool use_multi_step = 3;
     */
    useMultiStep?: boolean;
    /**
     * @generated from field: optional int32 max_multi_step_iterations = 4;
     */
    maxMultiStepIterations?: number;
    /**
     * @generated from field: optional tokagent.v1.ShouldRespondModelType should_respond_model = 5;
     */
    shouldRespondModel?: ShouldRespondModelType;
};
/**
 * Describes the message tokagent.v1.MessageProcessingOptions.
 * Use `create(MessageProcessingOptionsSchema)` to create a new message.
 */
export declare const MessageProcessingOptionsSchema: GenMessage<MessageProcessingOptions>;
/**
 * Result of message processing.
 *
 * @generated from message tokagent.v1.MessageProcessingResult
 */
export type MessageProcessingResult = Message<"tokagent.v1.MessageProcessingResult"> & {
    /**
     * @generated from field: bool did_respond = 1;
     */
    didRespond: boolean;
    /**
     * @generated from field: optional tokagent.v1.Content response_content = 2;
     */
    responseContent?: Content;
    /**
     * @generated from field: repeated tokagent.v1.Memory response_messages = 3;
     */
    responseMessages: Memory[];
    /**
     * @generated from field: tokagent.v1.State state = 4;
     */
    state?: State;
    /**
     * @generated from field: optional tokagent.v1.MessageProcessingMode mode = 5;
     */
    mode?: MessageProcessingMode;
};
/**
 * Describes the message tokagent.v1.MessageProcessingResult.
 * Use `create(MessageProcessingResultSchema)` to create a new message.
 */
export declare const MessageProcessingResultSchema: GenMessage<MessageProcessingResult>;
/**
 * Response decision from the shouldRespond logic.
 *
 * @generated from message tokagent.v1.ResponseDecision
 */
export type ResponseDecision = Message<"tokagent.v1.ResponseDecision"> & {
    /**
     * @generated from field: bool should_respond = 1;
     */
    shouldRespond: boolean;
    /**
     * @generated from field: bool skip_evaluation = 2;
     */
    skipEvaluation: boolean;
    /**
     * @generated from field: string reason = 3;
     */
    reason: string;
};
/**
 * Describes the message tokagent.v1.ResponseDecision.
 * Use `create(ResponseDecisionSchema)` to create a new message.
 */
export declare const ResponseDecisionSchema: GenMessage<ResponseDecision>;
/**
 * Model type configuration for shouldRespond evaluation.
 *
 * @generated from enum tokagent.v1.ShouldRespondModelType
 */
export declare enum ShouldRespondModelType {
    /**
     * @generated from enum value: SHOULD_RESPOND_MODEL_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: SHOULD_RESPOND_MODEL_TYPE_NANO = 1;
     */
    NANO = 1,
    /**
     * @generated from enum value: SHOULD_RESPOND_MODEL_TYPE_SMALL = 2;
     */
    SMALL = 2,
    /**
     * @generated from enum value: SHOULD_RESPOND_MODEL_TYPE_LARGE = 3;
     */
    LARGE = 3,
    /**
     * @generated from enum value: SHOULD_RESPOND_MODEL_TYPE_MEGA = 4;
     */
    MEGA = 4,
    /**
     * @generated from enum value: SHOULD_RESPOND_MODEL_TYPE_RESPONSE_HANDLER = 5;
     */
    RESPONSE_HANDLER = 5
}
/**
 * Describes the enum tokagent.v1.ShouldRespondModelType.
 */
export declare const ShouldRespondModelTypeSchema: GenEnum<ShouldRespondModelType>;
/**
 * Processing mode used by message handler.
 *
 * @generated from enum tokagent.v1.MessageProcessingMode
 */
export declare enum MessageProcessingMode {
    /**
     * @generated from enum value: MESSAGE_PROCESSING_MODE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: MESSAGE_PROCESSING_MODE_SIMPLE = 1;
     */
    SIMPLE = 1,
    /**
     * @generated from enum value: MESSAGE_PROCESSING_MODE_ACTIONS = 2;
     */
    ACTIONS = 2,
    /**
     * @generated from enum value: MESSAGE_PROCESSING_MODE_NONE = 3;
     */
    NONE = 3
}
/**
 * Describes the enum tokagent.v1.MessageProcessingMode.
 */
export declare const MessageProcessingModeSchema: GenEnum<MessageProcessingMode>;
//# sourceMappingURL=message_service_pb.d.ts.map