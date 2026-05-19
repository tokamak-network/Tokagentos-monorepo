import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/model.proto.
 */
export declare const file_tokagent_v1_model: GenFile;
/**
 * Response format specification
 *
 * @generated from message tokagent.v1.ResponseFormat
 */
export type ResponseFormat = Message<"tokagent.v1.ResponseFormat"> & {
    /**
     * "json_object" | "text"
     *
     * @generated from field: string type = 1;
     */
    type: string;
};
/**
 * Describes the message tokagent.v1.ResponseFormat.
 * Use `create(ResponseFormatSchema)` to create a new message.
 */
export declare const ResponseFormatSchema: GenMessage<ResponseFormat>;
/**
 * Parameters for generating text using a language model
 *
 * @generated from message tokagent.v1.GenerateTextParams
 */
export type GenerateTextParams = Message<"tokagent.v1.GenerateTextParams"> & {
    /**
     * @generated from field: string prompt = 1;
     */
    prompt: string;
    /**
     * @generated from field: optional int32 max_tokens = 2;
     */
    maxTokens?: number;
    /**
     * @generated from field: optional int32 min_tokens = 3;
     */
    minTokens?: number;
    /**
     * @generated from field: optional double temperature = 4;
     */
    temperature?: number;
    /**
     * @generated from field: optional double top_p = 5;
     */
    topP?: number;
    /**
     * @generated from field: optional int32 top_k = 6;
     */
    topK?: number;
    /**
     * @generated from field: optional double min_p = 7;
     */
    minP?: number;
    /**
     * @generated from field: optional int32 seed = 8;
     */
    seed?: number;
    /**
     * @generated from field: optional double repetition_penalty = 9;
     */
    repetitionPenalty?: number;
    /**
     * @generated from field: optional double frequency_penalty = 10;
     */
    frequencyPenalty?: number;
    /**
     * @generated from field: optional double presence_penalty = 11;
     */
    presencePenalty?: number;
    /**
     * @generated from field: repeated string stop_sequences = 12;
     */
    stopSequences: string[];
    /**
     * @generated from field: optional string user = 13;
     */
    user?: string;
    /**
     * @generated from field: optional tokagent.v1.ResponseFormat response_format = 14;
     */
    responseFormat?: ResponseFormat;
    /**
     * @generated from field: optional bool stream = 15;
     */
    stream?: boolean;
};
/**
 * Describes the message tokagent.v1.GenerateTextParams.
 * Use `create(GenerateTextParamsSchema)` to create a new message.
 */
export declare const GenerateTextParamsSchema: GenMessage<GenerateTextParams>;
/**
 * Token usage information
 *
 * @generated from message tokagent.v1.TokenUsage
 */
export type TokenUsage = Message<"tokagent.v1.TokenUsage"> & {
    /**
     * @generated from field: int32 prompt_tokens = 1;
     */
    promptTokens: number;
    /**
     * @generated from field: int32 completion_tokens = 2;
     */
    completionTokens: number;
    /**
     * @generated from field: int32 total_tokens = 3;
     */
    totalTokens: number;
};
/**
 * Describes the message tokagent.v1.TokenUsage.
 * Use `create(TokenUsageSchema)` to create a new message.
 */
export declare const TokenUsageSchema: GenMessage<TokenUsage>;
/**
 * Text stream chunk
 *
 * @generated from message tokagent.v1.TextStreamChunk
 */
export type TextStreamChunk = Message<"tokagent.v1.TextStreamChunk"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
    /**
     * @generated from field: bool done = 2;
     */
    done: boolean;
};
/**
 * Describes the message tokagent.v1.TextStreamChunk.
 * Use `create(TextStreamChunkSchema)` to create a new message.
 */
export declare const TextStreamChunkSchema: GenMessage<TextStreamChunk>;
/**
 * Options for the simplified generateText API
 *
 * @generated from message tokagent.v1.GenerateTextOptions
 */
export type GenerateTextOptions = Message<"tokagent.v1.GenerateTextOptions"> & {
    /**
     * @generated from field: optional bool include_character = 1;
     */
    includeCharacter?: boolean;
    /**
     * @generated from field: tokagent.v1.ModelType model_type = 2;
     */
    modelType: ModelType;
    /**
     * @generated from field: optional int32 max_tokens = 3;
     */
    maxTokens?: number;
    /**
     * @generated from field: optional double temperature = 4;
     */
    temperature?: number;
    /**
     * @generated from field: optional double frequency_penalty = 5;
     */
    frequencyPenalty?: number;
    /**
     * @generated from field: optional double presence_penalty = 6;
     */
    presencePenalty?: number;
    /**
     * @generated from field: repeated string stop_sequences = 7;
     */
    stopSequences: string[];
};
/**
 * Describes the message tokagent.v1.GenerateTextOptions.
 * Use `create(GenerateTextOptionsSchema)` to create a new message.
 */
export declare const GenerateTextOptionsSchema: GenMessage<GenerateTextOptions>;
/**
 * Structured response from text generation
 *
 * @generated from message tokagent.v1.GenerateTextResult
 */
export type GenerateTextResult = Message<"tokagent.v1.GenerateTextResult"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
    /**
     * @generated from field: optional tokagent.v1.TokenUsage usage = 2;
     */
    usage?: TokenUsage;
};
/**
 * Describes the message tokagent.v1.GenerateTextResult.
 * Use `create(GenerateTextResultSchema)` to create a new message.
 */
export declare const GenerateTextResultSchema: GenMessage<GenerateTextResult>;
/**
 * Parameters for text tokenization
 *
 * @generated from message tokagent.v1.TokenizeTextParams
 */
export type TokenizeTextParams = Message<"tokagent.v1.TokenizeTextParams"> & {
    /**
     * @generated from field: string prompt = 1;
     */
    prompt: string;
    /**
     * @generated from field: tokagent.v1.ModelType model_type = 2;
     */
    modelType: ModelType;
};
/**
 * Describes the message tokagent.v1.TokenizeTextParams.
 * Use `create(TokenizeTextParamsSchema)` to create a new message.
 */
export declare const TokenizeTextParamsSchema: GenMessage<TokenizeTextParams>;
/**
 * Parameters for detokenization
 *
 * @generated from message tokagent.v1.DetokenizeTextParams
 */
export type DetokenizeTextParams = Message<"tokagent.v1.DetokenizeTextParams"> & {
    /**
     * @generated from field: repeated int32 tokens = 1;
     */
    tokens: number[];
    /**
     * @generated from field: tokagent.v1.ModelType model_type = 2;
     */
    modelType: ModelType;
};
/**
 * Describes the message tokagent.v1.DetokenizeTextParams.
 * Use `create(DetokenizeTextParamsSchema)` to create a new message.
 */
export declare const DetokenizeTextParamsSchema: GenMessage<DetokenizeTextParams>;
/**
 * Parameters for text embedding
 *
 * @generated from message tokagent.v1.TextEmbeddingParams
 */
export type TextEmbeddingParams = Message<"tokagent.v1.TextEmbeddingParams"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
};
/**
 * Describes the message tokagent.v1.TextEmbeddingParams.
 * Use `create(TextEmbeddingParamsSchema)` to create a new message.
 */
export declare const TextEmbeddingParamsSchema: GenMessage<TextEmbeddingParams>;
/**
 * Parameters for image generation
 *
 * @generated from message tokagent.v1.ImageGenerationParams
 */
export type ImageGenerationParams = Message<"tokagent.v1.ImageGenerationParams"> & {
    /**
     * @generated from field: string prompt = 1;
     */
    prompt: string;
    /**
     * @generated from field: optional string size = 2;
     */
    size?: string;
    /**
     * @generated from field: optional int32 count = 3;
     */
    count?: number;
};
/**
 * Describes the message tokagent.v1.ImageGenerationParams.
 * Use `create(ImageGenerationParamsSchema)` to create a new message.
 */
export declare const ImageGenerationParamsSchema: GenMessage<ImageGenerationParams>;
/**
 * Parameters for image description
 *
 * @generated from message tokagent.v1.ImageDescriptionParams
 */
export type ImageDescriptionParams = Message<"tokagent.v1.ImageDescriptionParams"> & {
    /**
     * @generated from field: string image_url = 1;
     */
    imageUrl: string;
    /**
     * @generated from field: optional string prompt = 2;
     */
    prompt?: string;
};
/**
 * Describes the message tokagent.v1.ImageDescriptionParams.
 * Use `create(ImageDescriptionParamsSchema)` to create a new message.
 */
export declare const ImageDescriptionParamsSchema: GenMessage<ImageDescriptionParams>;
/**
 * Image description result
 *
 * @generated from message tokagent.v1.ImageDescriptionResult
 */
export type ImageDescriptionResult = Message<"tokagent.v1.ImageDescriptionResult"> & {
    /**
     * @generated from field: string title = 1;
     */
    title: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
};
/**
 * Describes the message tokagent.v1.ImageDescriptionResult.
 * Use `create(ImageDescriptionResultSchema)` to create a new message.
 */
export declare const ImageDescriptionResultSchema: GenMessage<ImageDescriptionResult>;
/**
 * Parameters for transcription
 *
 * @generated from message tokagent.v1.TranscriptionParams
 */
export type TranscriptionParams = Message<"tokagent.v1.TranscriptionParams"> & {
    /**
     * @generated from field: string audio_url = 1;
     */
    audioUrl: string;
    /**
     * @generated from field: optional string prompt = 2;
     */
    prompt?: string;
};
/**
 * Describes the message tokagent.v1.TranscriptionParams.
 * Use `create(TranscriptionParamsSchema)` to create a new message.
 */
export declare const TranscriptionParamsSchema: GenMessage<TranscriptionParams>;
/**
 * Parameters for text-to-speech
 *
 * @generated from message tokagent.v1.TextToSpeechParams
 */
export type TextToSpeechParams = Message<"tokagent.v1.TextToSpeechParams"> & {
    /**
     * @generated from field: string text = 1;
     */
    text: string;
    /**
     * @generated from field: optional string voice = 2;
     */
    voice?: string;
    /**
     * @generated from field: optional double speed = 3;
     */
    speed?: number;
};
/**
 * Describes the message tokagent.v1.TextToSpeechParams.
 * Use `create(TextToSpeechParamsSchema)` to create a new message.
 */
export declare const TextToSpeechParamsSchema: GenMessage<TextToSpeechParams>;
/**
 * Parameters for audio processing
 *
 * @generated from message tokagent.v1.AudioProcessingParams
 */
export type AudioProcessingParams = Message<"tokagent.v1.AudioProcessingParams"> & {
    /**
     * @generated from field: string audio_url = 1;
     */
    audioUrl: string;
    /**
     * @generated from field: string processing_type = 2;
     */
    processingType: string;
};
/**
 * Describes the message tokagent.v1.AudioProcessingParams.
 * Use `create(AudioProcessingParamsSchema)` to create a new message.
 */
export declare const AudioProcessingParamsSchema: GenMessage<AudioProcessingParams>;
/**
 * Parameters for video processing
 *
 * @generated from message tokagent.v1.VideoProcessingParams
 */
export type VideoProcessingParams = Message<"tokagent.v1.VideoProcessingParams"> & {
    /**
     * @generated from field: string video_url = 1;
     */
    videoUrl: string;
    /**
     * @generated from field: string processing_type = 2;
     */
    processingType: string;
};
/**
 * Describes the message tokagent.v1.VideoProcessingParams.
 * Use `create(VideoProcessingParamsSchema)` to create a new message.
 */
export declare const VideoProcessingParamsSchema: GenMessage<VideoProcessingParams>;
/**
 * JSON Schema for object generation
 *
 * @generated from message tokagent.v1.JSONSchema
 */
export type JSONSchema = Message<"tokagent.v1.JSONSchema"> & {
    /**
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: map<string, tokagent.v1.JSONSchema> properties = 2;
     */
    properties: {
        [key: string]: JSONSchema;
    };
    /**
     * @generated from field: repeated string required = 3;
     */
    required: string[];
    /**
     * @generated from field: optional tokagent.v1.JSONSchema items = 4;
     */
    items?: JSONSchema;
    /**
     * @generated from field: google.protobuf.Struct extra = 5;
     */
    extra?: JsonObject;
};
/**
 * Describes the message tokagent.v1.JSONSchema.
 * Use `create(JSONSchemaSchema)` to create a new message.
 */
export declare const JSONSchemaSchema: GenMessage<JSONSchema>;
/**
 * Parameters for object generation
 *
 * @generated from message tokagent.v1.ObjectGenerationParams
 */
export type ObjectGenerationParams = Message<"tokagent.v1.ObjectGenerationParams"> & {
    /**
     * @generated from field: string prompt = 1;
     */
    prompt: string;
    /**
     * @generated from field: optional tokagent.v1.JSONSchema schema = 2;
     */
    schema?: JSONSchema;
    /**
     * "object" | "array" | "enum"
     *
     * @generated from field: optional string output = 3;
     */
    output?: string;
    /**
     * @generated from field: repeated string enum_values = 4;
     */
    enumValues: string[];
    /**
     * @generated from field: tokagent.v1.ModelType model_type = 5;
     */
    modelType: ModelType;
    /**
     * @generated from field: optional double temperature = 6;
     */
    temperature?: number;
    /**
     * @generated from field: optional int32 max_tokens = 7;
     */
    maxTokens?: number;
    /**
     * @generated from field: repeated string stop_sequences = 8;
     */
    stopSequences: string[];
};
/**
 * Describes the message tokagent.v1.ObjectGenerationParams.
 * Use `create(ObjectGenerationParamsSchema)` to create a new message.
 */
export declare const ObjectGenerationParamsSchema: GenMessage<ObjectGenerationParams>;
/**
 * Image generation result
 *
 * @generated from message tokagent.v1.ImageGenerationResult
 */
export type ImageGenerationResult = Message<"tokagent.v1.ImageGenerationResult"> & {
    /**
     * @generated from field: string url = 1;
     */
    url: string;
};
/**
 * Describes the message tokagent.v1.ImageGenerationResult.
 * Use `create(ImageGenerationResultSchema)` to create a new message.
 */
export declare const ImageGenerationResultSchema: GenMessage<ImageGenerationResult>;
/**
 * Model handler registration info
 *
 * @generated from message tokagent.v1.ModelHandlerInfo
 */
export type ModelHandlerInfo = Message<"tokagent.v1.ModelHandlerInfo"> & {
    /**
     * @generated from field: string provider = 1;
     */
    provider: string;
    /**
     * @generated from field: optional int32 priority = 2;
     */
    priority?: number;
    /**
     * @generated from field: optional int32 registration_order = 3;
     */
    registrationOrder?: number;
};
/**
 * Describes the message tokagent.v1.ModelHandlerInfo.
 * Use `create(ModelHandlerInfoSchema)` to create a new message.
 */
export declare const ModelHandlerInfoSchema: GenMessage<ModelHandlerInfo>;
/**
 * LLM Mode for overriding model selection
 *
 * @generated from enum tokagent.v1.LLMMode
 */
export declare enum LLMMode {
    /**
     * @generated from enum value: LLM_MODE_UNSPECIFIED = 0;
     */
    LLM_MODE_UNSPECIFIED = 0,
    /**
     * Use the model type as specified
     *
     * @generated from enum value: LLM_MODE_DEFAULT = 1;
     */
    LLM_MODE_DEFAULT = 1,
    /**
     * Override to use TEXT_SMALL
     *
     * @generated from enum value: LLM_MODE_SMALL = 2;
     */
    LLM_MODE_SMALL = 2,
    /**
     * Override to use TEXT_LARGE
     *
     * @generated from enum value: LLM_MODE_LARGE = 3;
     */
    LLM_MODE_LARGE = 3
}
/**
 * Describes the enum tokagent.v1.LLMMode.
 */
export declare const LLMModeSchema: GenEnum<LLMMode>;
/**
 * Model type enumeration
 *
 * @generated from enum tokagent.v1.ModelType
 */
export declare enum ModelType {
    /**
     * @generated from enum value: MODEL_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_SMALL = 1;
     */
    TEXT_SMALL = 1,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_LARGE = 2;
     */
    TEXT_LARGE = 2,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_EMBEDDING = 3;
     */
    TEXT_EMBEDDING = 3,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_TOKENIZER_ENCODE = 4;
     */
    TEXT_TOKENIZER_ENCODE = 4,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_TOKENIZER_DECODE = 5;
     */
    TEXT_TOKENIZER_DECODE = 5,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_COMPLETION = 8;
     */
    TEXT_COMPLETION = 8,
    /**
     * @generated from enum value: MODEL_TYPE_IMAGE = 9;
     */
    IMAGE = 9,
    /**
     * @generated from enum value: MODEL_TYPE_IMAGE_DESCRIPTION = 10;
     */
    IMAGE_DESCRIPTION = 10,
    /**
     * @generated from enum value: MODEL_TYPE_TRANSCRIPTION = 11;
     */
    TRANSCRIPTION = 11,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_TO_SPEECH = 12;
     */
    TEXT_TO_SPEECH = 12,
    /**
     * @generated from enum value: MODEL_TYPE_AUDIO = 13;
     */
    AUDIO = 13,
    /**
     * @generated from enum value: MODEL_TYPE_VIDEO = 14;
     */
    VIDEO = 14,
    /**
     * @generated from enum value: MODEL_TYPE_OBJECT_SMALL = 15;
     */
    OBJECT_SMALL = 15,
    /**
     * @generated from enum value: MODEL_TYPE_OBJECT_LARGE = 16;
     */
    OBJECT_LARGE = 16,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_NANO = 17;
     */
    TEXT_NANO = 17,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_MEDIUM = 18;
     */
    TEXT_MEDIUM = 18,
    /**
     * @generated from enum value: MODEL_TYPE_TEXT_MEGA = 19;
     */
    TEXT_MEGA = 19,
    /**
     * @generated from enum value: MODEL_TYPE_RESPONSE_HANDLER = 20;
     */
    RESPONSE_HANDLER = 20,
    /**
     * @generated from enum value: MODEL_TYPE_ACTION_PLANNER = 21;
     */
    ACTION_PLANNER = 21,
    /**
     * @generated from enum value: MODEL_TYPE_RESEARCH = 22;
     */
    RESEARCH = 22
}
/**
 * Describes the enum tokagent.v1.ModelType.
 */
export declare const ModelTypeSchema: GenEnum<ModelType>;
//# sourceMappingURL=model_pb.d.ts.map