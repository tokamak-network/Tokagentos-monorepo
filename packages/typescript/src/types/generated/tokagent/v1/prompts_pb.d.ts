import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/prompts.proto.
 */
export declare const file_tokagent_v1_prompts: GenFile;
/**
 * Information about a field for prompt building.
 *
 * @generated from message tokagent.v1.PromptFieldInfo
 */
export type PromptFieldInfo = Message<"tokagent.v1.PromptFieldInfo"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string type = 2;
     */
    type: string;
    /**
     * @generated from field: string label = 3;
     */
    label: string;
    /**
     * @generated from field: optional string description = 4;
     */
    description?: string;
    /**
     * @generated from field: optional string criteria = 5;
     */
    criteria?: string;
};
/**
 * Describes the message tokagent.v1.PromptFieldInfo.
 * Use `create(PromptFieldInfoSchema)` to create a new message.
 */
export declare const PromptFieldInfoSchema: GenMessage<PromptFieldInfo>;
/**
 * Options for building a prompt from a template.
 *
 * @generated from message tokagent.v1.BuildPromptOptions
 */
export type BuildPromptOptions = Message<"tokagent.v1.BuildPromptOptions"> & {
    /**
     * Template string (function templates are runtime-only).
     *
     * @generated from field: string template = 1;
     */
    template: string;
    /**
     * State values to substitute into the template.
     *
     * @generated from field: google.protobuf.Struct state = 2;
     */
    state?: JsonObject;
    /**
     * Optional default values for template variables.
     *
     * @generated from field: map<string, string> defaults = 3;
     */
    defaults: {
        [key: string]: string;
    };
};
/**
 * Describes the message tokagent.v1.BuildPromptOptions.
 * Use `create(BuildPromptOptionsSchema)` to create a new message.
 */
export declare const BuildPromptOptionsSchema: GenMessage<BuildPromptOptions>;
/**
 * Result of building a prompt from a template.
 *
 * @generated from message tokagent.v1.BuiltPrompt
 */
export type BuiltPrompt = Message<"tokagent.v1.BuiltPrompt"> & {
    /**
     * @generated from field: string prompt = 1;
     */
    prompt: string;
    /**
     * @generated from field: optional string system = 2;
     */
    system?: string;
    /**
     * @generated from field: repeated string substituted_variables = 3;
     */
    substitutedVariables: string[];
    /**
     * @generated from field: repeated string missing_variables = 4;
     */
    missingVariables: string[];
};
/**
 * Describes the message tokagent.v1.BuiltPrompt.
 * Use `create(BuiltPromptSchema)` to create a new message.
 */
export declare const BuiltPromptSchema: GenMessage<BuiltPrompt>;
/**
 * Configuration for a prompt template.
 *
 * @generated from message tokagent.v1.PromptTemplateConfig
 */
export type PromptTemplateConfig = Message<"tokagent.v1.PromptTemplateConfig"> & {
    /**
     * @generated from field: string template = 1;
     */
    template: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    /**
     * @generated from field: optional string description = 3;
     */
    description?: string;
    /**
     * @generated from field: map<string, string> defaults = 4;
     */
    defaults: {
        [key: string]: string;
    };
    /**
     * @generated from field: repeated string required_variables = 5;
     */
    requiredVariables: string[];
    /**
     * @generated from field: repeated string optional_variables = 6;
     */
    optionalVariables: string[];
};
/**
 * Describes the message tokagent.v1.PromptTemplateConfig.
 * Use `create(PromptTemplateConfigSchema)` to create a new message.
 */
export declare const PromptTemplateConfigSchema: GenMessage<PromptTemplateConfig>;
//# sourceMappingURL=prompts_pb.d.ts.map