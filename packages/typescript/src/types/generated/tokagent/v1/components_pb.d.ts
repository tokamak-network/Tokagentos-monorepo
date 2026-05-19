import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Content } from "./primitives_pb.js";
import type { Value } from "@bufbuild/protobuf/wkt";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/components.proto.
 */
export declare const file_tokagent_v1_components: GenFile;
/**
 * JSON Schema for action parameter validation
 *
 * @generated from message tokagent.v1.ActionParameterSchema
 */
export type ActionParameterSchema = Message<"tokagent.v1.ActionParameterSchema"> & {
    /**
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: optional string description = 2;
     */
    description?: string;
    /**
     * Default value
     *
     * @generated from field: google.protobuf.Value default_value = 3;
     */
    defaultValue?: Value;
    /**
     * Allowed enum values
     *
     * @generated from field: repeated string enum_values = 4;
     */
    enumValues: string[];
    /**
     * Nested properties for object types
     *
     * @generated from field: map<string, tokagent.v1.ActionParameterSchema> properties = 5;
     */
    properties: {
        [key: string]: ActionParameterSchema;
    };
    /**
     * Item schema for array types
     *
     * @generated from field: optional tokagent.v1.ActionParameterSchema items = 6;
     */
    items?: ActionParameterSchema;
    /**
     * Numeric constraints
     *
     * @generated from field: optional double minimum = 7;
     */
    minimum?: number;
    /**
     * @generated from field: optional double maximum = 8;
     */
    maximum?: number;
    /**
     * String pattern (regex)
     *
     * @generated from field: optional string pattern = 9;
     */
    pattern?: string;
};
/**
 * Describes the message tokagent.v1.ActionParameterSchema.
 * Use `create(ActionParameterSchemaSchema)` to create a new message.
 */
export declare const ActionParameterSchemaSchema: GenMessage<ActionParameterSchema>;
/**
 * Defines a single parameter for an action
 *
 * @generated from message tokagent.v1.ActionParameter
 */
export type ActionParameter = Message<"tokagent.v1.ActionParameter"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
    /**
     * @generated from field: optional bool required = 3;
     */
    required?: boolean;
    /**
     * @generated from field: tokagent.v1.ActionParameterSchema schema = 4;
     */
    schema?: ActionParameterSchema;
};
/**
 * Describes the message tokagent.v1.ActionParameter.
 * Use `create(ActionParameterSchema$)` to create a new message.
 */
export declare const ActionParameterSchema$: GenMessage<ActionParameter>;
/**
 * Example content with associated user for demonstration
 *
 * @generated from message tokagent.v1.ActionExample
 */
export type ActionExample = Message<"tokagent.v1.ActionExample"> & {
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
 * Describes the message tokagent.v1.ActionExample.
 * Use `create(ActionExampleSchema)` to create a new message.
 */
export declare const ActionExampleSchema: GenMessage<ActionExample>;
/**
 * Validated parameters passed to an action handler
 * Represented as a Struct for flexibility with nested values
 *
 * @generated from message tokagent.v1.ActionParameters
 */
export type ActionParameters = Message<"tokagent.v1.ActionParameters"> & {
    /**
     * @generated from field: google.protobuf.Struct values = 1;
     */
    values?: JsonObject;
};
/**
 * Describes the message tokagent.v1.ActionParameters.
 * Use `create(ActionParametersSchema)` to create a new message.
 */
export declare const ActionParametersSchema: GenMessage<ActionParameters>;
/**
 * Result returned by an action after execution
 *
 * @generated from message tokagent.v1.ActionResult
 */
export type ActionResult = Message<"tokagent.v1.ActionResult"> & {
    /**
     * @generated from field: bool success = 1;
     */
    success: boolean;
    /**
     * @generated from field: optional string text = 2;
     */
    text?: string;
    /**
     * @generated from field: google.protobuf.Struct values = 3;
     */
    values?: JsonObject;
    /**
     * @generated from field: google.protobuf.Struct data = 4;
     */
    data?: JsonObject;
    /**
     * @generated from field: optional string error = 5;
     */
    error?: string;
};
/**
 * Describes the message tokagent.v1.ActionResult.
 * Use `create(ActionResultSchema)` to create a new message.
 */
export declare const ActionResultSchema: GenMessage<ActionResult>;
/**
 * Context provided to actions during execution
 *
 * @generated from message tokagent.v1.ActionContext
 */
export type ActionContext = Message<"tokagent.v1.ActionContext"> & {
    /**
     * @generated from field: repeated tokagent.v1.ActionResult previous_results = 1;
     */
    previousResults: ActionResult[];
};
/**
 * Describes the message tokagent.v1.ActionContext.
 * Use `create(ActionContextSchema)` to create a new message.
 */
export declare const ActionContextSchema: GenMessage<ActionContext>;
/**
 * Options passed to action handlers during execution
 *
 * @generated from message tokagent.v1.HandlerOptions
 */
export type HandlerOptions = Message<"tokagent.v1.HandlerOptions"> & {
    /**
     * @generated from field: optional tokagent.v1.ActionContext action_context = 1;
     */
    actionContext?: ActionContext;
    /**
     * Forward reference to ActionPlan (defined in state.proto)
     *
     * Serialized ActionPlan
     *
     * @generated from field: optional string action_plan_json = 2;
     */
    actionPlanJson?: string;
    /**
     * @generated from field: optional tokagent.v1.ActionParameters parameters = 3;
     */
    parameters?: ActionParameters;
};
/**
 * Describes the message tokagent.v1.HandlerOptions.
 * Use `create(HandlerOptionsSchema)` to create a new message.
 */
export declare const HandlerOptionsSchema: GenMessage<HandlerOptions>;
/**
 * Action manifest (metadata only, for cross-language interop)
 *
 * @generated from message tokagent.v1.ActionManifest
 */
export type ActionManifest = Message<"tokagent.v1.ActionManifest"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
    /**
     * @generated from field: repeated string similes = 3;
     */
    similes: string[];
    /**
     * @generated from field: repeated tokagent.v1.ActionExample examples = 4;
     */
    examples: ActionExample[];
    /**
     * @generated from field: optional int32 priority = 5;
     */
    priority?: number;
    /**
     * @generated from field: repeated string tags = 6;
     */
    tags: string[];
    /**
     * @generated from field: repeated tokagent.v1.ActionParameter parameters = 7;
     */
    parameters: ActionParameter[];
};
/**
 * Describes the message tokagent.v1.ActionManifest.
 * Use `create(ActionManifestSchema)` to create a new message.
 */
export declare const ActionManifestSchema: GenMessage<ActionManifest>;
/**
 * Result returned by a provider
 *
 * @generated from message tokagent.v1.ProviderResult
 */
export type ProviderResult = Message<"tokagent.v1.ProviderResult"> & {
    /**
     * @generated from field: optional string text = 1;
     */
    text?: string;
    /**
     * @generated from field: google.protobuf.Struct values = 2;
     */
    values?: JsonObject;
    /**
     * @generated from field: google.protobuf.Struct data = 3;
     */
    data?: JsonObject;
};
/**
 * Describes the message tokagent.v1.ProviderResult.
 * Use `create(ProviderResultSchema)` to create a new message.
 */
export declare const ProviderResultSchema: GenMessage<ProviderResult>;
/**
 * Provider manifest (metadata only, for cross-language interop)
 *
 * @generated from message tokagent.v1.ProviderManifest
 */
export type ProviderManifest = Message<"tokagent.v1.ProviderManifest"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: optional string description = 2;
     */
    description?: string;
    /**
     * @generated from field: optional bool dynamic = 3;
     */
    dynamic?: boolean;
    /**
     * @generated from field: optional int32 position = 4;
     */
    position?: number;
    /**
     * @generated from field: optional bool private = 5;
     */
    private?: boolean;
};
/**
 * Describes the message tokagent.v1.ProviderManifest.
 * Use `create(ProviderManifestSchema)` to create a new message.
 */
export declare const ProviderManifestSchema: GenMessage<ProviderManifest>;
/**
 * Example for evaluating agent behavior
 *
 * @generated from message tokagent.v1.EvaluationExample
 */
export type EvaluationExample = Message<"tokagent.v1.EvaluationExample"> & {
    /**
     * @generated from field: string prompt = 1;
     */
    prompt: string;
    /**
     * @generated from field: repeated tokagent.v1.ActionExample messages = 2;
     */
    messages: ActionExample[];
    /**
     * @generated from field: string outcome = 3;
     */
    outcome: string;
};
/**
 * Describes the message tokagent.v1.EvaluationExample.
 * Use `create(EvaluationExampleSchema)` to create a new message.
 */
export declare const EvaluationExampleSchema: GenMessage<EvaluationExample>;
/**
 * Evaluator manifest (metadata only, for cross-language interop)
 *
 * @generated from message tokagent.v1.EvaluatorManifest
 */
export type EvaluatorManifest = Message<"tokagent.v1.EvaluatorManifest"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
    /**
     * @generated from field: optional bool always_run = 3;
     */
    alwaysRun?: boolean;
    /**
     * @generated from field: repeated string similes = 4;
     */
    similes: string[];
    /**
     * @generated from field: repeated tokagent.v1.EvaluationExample examples = 5;
     */
    examples: EvaluationExample[];
};
/**
 * Describes the message tokagent.v1.EvaluatorManifest.
 * Use `create(EvaluatorManifestSchema)` to create a new message.
 */
export declare const EvaluatorManifestSchema: GenMessage<EvaluatorManifest>;
//# sourceMappingURL=components_pb.d.ts.map