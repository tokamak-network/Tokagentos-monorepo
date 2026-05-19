import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { ActionManifest, ActionResult, EvaluatorManifest, ProviderManifest, ProviderResult } from "./components_pb.js";
import type { Memory } from "./memory_pb.js";
import type { EventHandlerList, RouteManifest } from "./plugin_pb.js";
import type { ServiceManifest } from "./service_pb.js";
import type { State } from "./state_pb.js";
import type { Value } from "@bufbuild/protobuf/wkt";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/ipc.proto.
 */
export declare const file_tokagent_v1_ipc: GenFile;
/**
 * Plugin interop configuration
 *
 * @generated from message tokagent.v1.PluginInteropConfig
 */
export type PluginInteropConfig = Message<"tokagent.v1.PluginInteropConfig"> & {
    /**
     * @generated from field: tokagent.v1.InteropProtocol protocol = 1;
     */
    protocol: InteropProtocol;
    /**
     * @generated from field: optional string wasm_path = 2;
     */
    wasmPath?: string;
    /**
     * @generated from field: optional string shared_lib_path = 3;
     */
    sharedLibPath?: string;
    /**
     * @generated from field: optional string ipc_command = 4;
     */
    ipcCommand?: string;
    /**
     * @generated from field: optional int32 ipc_port = 5;
     */
    ipcPort?: number;
    /**
     * @generated from field: optional string cwd = 6;
     */
    cwd?: string;
};
/**
 * Describes the message tokagent.v1.PluginInteropConfig.
 * Use `create(PluginInteropConfigSchema)` to create a new message.
 */
export declare const PluginInteropConfigSchema: GenMessage<PluginInteropConfig>;
/**
 * Cross-language plugin manifest
 *
 * @generated from message tokagent.v1.CrossLanguagePluginManifest
 */
export type CrossLanguagePluginManifest = Message<"tokagent.v1.CrossLanguagePluginManifest"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
    /**
     * @generated from field: string version = 3;
     */
    version: string;
    /**
     * @generated from field: tokagent.v1.PluginLanguage language = 4;
     */
    language: PluginLanguage;
    /**
     * @generated from field: optional tokagent.v1.PluginInteropConfig interop = 5;
     */
    interop?: PluginInteropConfig;
    /**
     * @generated from field: map<string, string> config = 6;
     */
    config: {
        [key: string]: string;
    };
    /**
     * @generated from field: repeated string dependencies = 7;
     */
    dependencies: string[];
    /**
     * @generated from field: repeated tokagent.v1.ActionManifest actions = 8;
     */
    actions: ActionManifest[];
    /**
     * @generated from field: repeated tokagent.v1.ProviderManifest providers = 9;
     */
    providers: ProviderManifest[];
    /**
     * @generated from field: repeated tokagent.v1.EvaluatorManifest evaluators = 10;
     */
    evaluators: EvaluatorManifest[];
    /**
     * @generated from field: repeated tokagent.v1.ServiceManifest services = 11;
     */
    services: ServiceManifest[];
    /**
     * @generated from field: repeated tokagent.v1.RouteManifest routes = 12;
     */
    routes: RouteManifest[];
    /**
     * @generated from field: map<string, tokagent.v1.EventHandlerList> events = 13;
     */
    events: {
        [key: string]: EventHandlerList;
    };
};
/**
 * Describes the message tokagent.v1.CrossLanguagePluginManifest.
 * Use `create(CrossLanguagePluginManifestSchema)` to create a new message.
 */
export declare const CrossLanguagePluginManifestSchema: GenMessage<CrossLanguagePluginManifest>;
/**
 * Base IPC message
 *
 * @generated from message tokagent.v1.IPCMessage
 */
export type IPCMessage = Message<"tokagent.v1.IPCMessage"> & {
    /**
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
};
/**
 * Describes the message tokagent.v1.IPCMessage.
 * Use `create(IPCMessageSchema)` to create a new message.
 */
export declare const IPCMessageSchema: GenMessage<IPCMessage>;
/**
 * Action invocation request
 *
 * @generated from message tokagent.v1.ActionInvokeRequest
 */
export type ActionInvokeRequest = Message<"tokagent.v1.ActionInvokeRequest"> & {
    /**
     * "action.invoke"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string action = 3;
     */
    action: string;
    /**
     * @generated from field: tokagent.v1.Memory memory = 4;
     */
    memory?: Memory;
    /**
     * @generated from field: optional tokagent.v1.State state = 5;
     */
    state?: State;
    /**
     * @generated from field: google.protobuf.Struct options = 6;
     */
    options?: JsonObject;
};
/**
 * Describes the message tokagent.v1.ActionInvokeRequest.
 * Use `create(ActionInvokeRequestSchema)` to create a new message.
 */
export declare const ActionInvokeRequestSchema: GenMessage<ActionInvokeRequest>;
/**
 * Action result response
 *
 * @generated from message tokagent.v1.ActionResultResponse
 */
export type ActionResultResponse = Message<"tokagent.v1.ActionResultResponse"> & {
    /**
     * "action.result"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: tokagent.v1.ActionResult result = 3;
     */
    result?: ActionResult;
};
/**
 * Describes the message tokagent.v1.ActionResultResponse.
 * Use `create(ActionResultResponseSchema)` to create a new message.
 */
export declare const ActionResultResponseSchema: GenMessage<ActionResultResponse>;
/**
 * Action validation request
 *
 * @generated from message tokagent.v1.ActionValidateRequest
 */
export type ActionValidateRequest = Message<"tokagent.v1.ActionValidateRequest"> & {
    /**
     * "action.validate"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string action = 3;
     */
    action: string;
    /**
     * @generated from field: tokagent.v1.Memory memory = 4;
     */
    memory?: Memory;
    /**
     * @generated from field: optional tokagent.v1.State state = 5;
     */
    state?: State;
};
/**
 * Describes the message tokagent.v1.ActionValidateRequest.
 * Use `create(ActionValidateRequestSchema)` to create a new message.
 */
export declare const ActionValidateRequestSchema: GenMessage<ActionValidateRequest>;
/**
 * Validation result response
 *
 * @generated from message tokagent.v1.ValidationResponse
 */
export type ValidationResponse = Message<"tokagent.v1.ValidationResponse"> & {
    /**
     * "validate.result"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: bool valid = 3;
     */
    valid: boolean;
};
/**
 * Describes the message tokagent.v1.ValidationResponse.
 * Use `create(ValidationResponseSchema)` to create a new message.
 */
export declare const ValidationResponseSchema: GenMessage<ValidationResponse>;
/**
 * Provider get request
 *
 * @generated from message tokagent.v1.ProviderGetRequest
 */
export type ProviderGetRequest = Message<"tokagent.v1.ProviderGetRequest"> & {
    /**
     * "provider.get"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string provider = 3;
     */
    provider: string;
    /**
     * @generated from field: tokagent.v1.Memory memory = 4;
     */
    memory?: Memory;
    /**
     * @generated from field: tokagent.v1.State state = 5;
     */
    state?: State;
};
/**
 * Describes the message tokagent.v1.ProviderGetRequest.
 * Use `create(ProviderGetRequestSchema)` to create a new message.
 */
export declare const ProviderGetRequestSchema: GenMessage<ProviderGetRequest>;
/**
 * Provider result response
 *
 * @generated from message tokagent.v1.ProviderResultResponse
 */
export type ProviderResultResponse = Message<"tokagent.v1.ProviderResultResponse"> & {
    /**
     * "provider.result"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: tokagent.v1.ProviderResult result = 3;
     */
    result?: ProviderResult;
};
/**
 * Describes the message tokagent.v1.ProviderResultResponse.
 * Use `create(ProviderResultResponseSchema)` to create a new message.
 */
export declare const ProviderResultResponseSchema: GenMessage<ProviderResultResponse>;
/**
 * Evaluator invocation request
 *
 * @generated from message tokagent.v1.EvaluatorInvokeRequest
 */
export type EvaluatorInvokeRequest = Message<"tokagent.v1.EvaluatorInvokeRequest"> & {
    /**
     * "evaluator.invoke"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string evaluator = 3;
     */
    evaluator: string;
    /**
     * @generated from field: tokagent.v1.Memory memory = 4;
     */
    memory?: Memory;
    /**
     * @generated from field: optional tokagent.v1.State state = 5;
     */
    state?: State;
};
/**
 * Describes the message tokagent.v1.EvaluatorInvokeRequest.
 * Use `create(EvaluatorInvokeRequestSchema)` to create a new message.
 */
export declare const EvaluatorInvokeRequestSchema: GenMessage<EvaluatorInvokeRequest>;
/**
 * Service start request
 *
 * @generated from message tokagent.v1.ServiceStartRequest
 */
export type ServiceStartRequest = Message<"tokagent.v1.ServiceStartRequest"> & {
    /**
     * "service.start"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string service = 3;
     */
    service: string;
};
/**
 * Describes the message tokagent.v1.ServiceStartRequest.
 * Use `create(ServiceStartRequestSchema)` to create a new message.
 */
export declare const ServiceStartRequestSchema: GenMessage<ServiceStartRequest>;
/**
 * Service stop request
 *
 * @generated from message tokagent.v1.ServiceStopRequest
 */
export type ServiceStopRequest = Message<"tokagent.v1.ServiceStopRequest"> & {
    /**
     * "service.stop"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string service = 3;
     */
    service: string;
};
/**
 * Describes the message tokagent.v1.ServiceStopRequest.
 * Use `create(ServiceStopRequestSchema)` to create a new message.
 */
export declare const ServiceStopRequestSchema: GenMessage<ServiceStopRequest>;
/**
 * Service response
 *
 * @generated from message tokagent.v1.ServiceResponse
 */
export type ServiceResponse = Message<"tokagent.v1.ServiceResponse"> & {
    /**
     * "service.response"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: bool success = 3;
     */
    success: boolean;
    /**
     * @generated from field: optional string error = 4;
     */
    error?: string;
};
/**
 * Describes the message tokagent.v1.ServiceResponse.
 * Use `create(ServiceResponseSchema)` to create a new message.
 */
export declare const ServiceResponseSchema: GenMessage<ServiceResponse>;
/**
 * Route handler request
 *
 * @generated from message tokagent.v1.RouteHandlerRequest
 */
export type RouteHandlerRequest = Message<"tokagent.v1.RouteHandlerRequest"> & {
    /**
     * "route.handle"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string path = 3;
     */
    path: string;
    /**
     * @generated from field: string method = 4;
     */
    method: string;
    /**
     * @generated from field: google.protobuf.Struct body = 5;
     */
    body?: JsonObject;
    /**
     * @generated from field: map<string, string> params = 6;
     */
    params: {
        [key: string]: string;
    };
    /**
     * @generated from field: map<string, string> query = 7;
     */
    query: {
        [key: string]: string;
    };
    /**
     * @generated from field: map<string, string> headers = 8;
     */
    headers: {
        [key: string]: string;
    };
};
/**
 * Describes the message tokagent.v1.RouteHandlerRequest.
 * Use `create(RouteHandlerRequestSchema)` to create a new message.
 */
export declare const RouteHandlerRequestSchema: GenMessage<RouteHandlerRequest>;
/**
 * Route handler response
 *
 * @generated from message tokagent.v1.RouteHandlerResponse
 */
export type RouteHandlerResponse = Message<"tokagent.v1.RouteHandlerResponse"> & {
    /**
     * "route.response"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: int32 status = 3;
     */
    status: number;
    /**
     * @generated from field: map<string, string> headers = 4;
     */
    headers: {
        [key: string]: string;
    };
    /**
     * @generated from field: google.protobuf.Value body = 5;
     */
    body?: Value;
};
/**
 * Describes the message tokagent.v1.RouteHandlerResponse.
 * Use `create(RouteHandlerResponseSchema)` to create a new message.
 */
export declare const RouteHandlerResponseSchema: GenMessage<RouteHandlerResponse>;
/**
 * Plugin initialization request
 *
 * @generated from message tokagent.v1.PluginInitRequest
 */
export type PluginInitRequest = Message<"tokagent.v1.PluginInitRequest"> & {
    /**
     * "plugin.init"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: map<string, string> config = 3;
     */
    config: {
        [key: string]: string;
    };
};
/**
 * Describes the message tokagent.v1.PluginInitRequest.
 * Use `create(PluginInitRequestSchema)` to create a new message.
 */
export declare const PluginInitRequestSchema: GenMessage<PluginInitRequest>;
/**
 * Plugin initialization response
 *
 * @generated from message tokagent.v1.PluginInitResponse
 */
export type PluginInitResponse = Message<"tokagent.v1.PluginInitResponse"> & {
    /**
     * "plugin.init.result"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: bool success = 3;
     */
    success: boolean;
    /**
     * @generated from field: optional string error = 4;
     */
    error?: string;
};
/**
 * Describes the message tokagent.v1.PluginInitResponse.
 * Use `create(PluginInitResponseSchema)` to create a new message.
 */
export declare const PluginInitResponseSchema: GenMessage<PluginInitResponse>;
/**
 * Error response
 *
 * @generated from message tokagent.v1.ErrorResponse
 */
export type ErrorResponse = Message<"tokagent.v1.ErrorResponse"> & {
    /**
     * "error"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: string id = 2;
     */
    id: string;
    /**
     * @generated from field: string error = 3;
     */
    error: string;
    /**
     * @generated from field: google.protobuf.Struct details = 4;
     */
    details?: JsonObject;
};
/**
 * Describes the message tokagent.v1.ErrorResponse.
 * Use `create(ErrorResponseSchema)` to create a new message.
 */
export declare const ErrorResponseSchema: GenMessage<ErrorResponse>;
/**
 * Union of all IPC request types
 *
 * @generated from message tokagent.v1.IPCRequest
 */
export type IPCRequest = Message<"tokagent.v1.IPCRequest"> & {
    /**
     * @generated from oneof tokagent.v1.IPCRequest.request
     */
    request: {
        /**
         * @generated from field: tokagent.v1.ActionInvokeRequest action_invoke = 1;
         */
        value: ActionInvokeRequest;
        case: "actionInvoke";
    } | {
        /**
         * @generated from field: tokagent.v1.ActionValidateRequest action_validate = 2;
         */
        value: ActionValidateRequest;
        case: "actionValidate";
    } | {
        /**
         * @generated from field: tokagent.v1.ProviderGetRequest provider_get = 3;
         */
        value: ProviderGetRequest;
        case: "providerGet";
    } | {
        /**
         * @generated from field: tokagent.v1.EvaluatorInvokeRequest evaluator_invoke = 4;
         */
        value: EvaluatorInvokeRequest;
        case: "evaluatorInvoke";
    } | {
        /**
         * @generated from field: tokagent.v1.ServiceStartRequest service_start = 5;
         */
        value: ServiceStartRequest;
        case: "serviceStart";
    } | {
        /**
         * @generated from field: tokagent.v1.ServiceStopRequest service_stop = 6;
         */
        value: ServiceStopRequest;
        case: "serviceStop";
    } | {
        /**
         * @generated from field: tokagent.v1.RouteHandlerRequest route_handle = 7;
         */
        value: RouteHandlerRequest;
        case: "routeHandle";
    } | {
        /**
         * @generated from field: tokagent.v1.PluginInitRequest plugin_init = 8;
         */
        value: PluginInitRequest;
        case: "pluginInit";
    } | {
        case: undefined;
        value?: undefined;
    };
};
/**
 * Describes the message tokagent.v1.IPCRequest.
 * Use `create(IPCRequestSchema)` to create a new message.
 */
export declare const IPCRequestSchema: GenMessage<IPCRequest>;
/**
 * Union of all IPC response types
 *
 * @generated from message tokagent.v1.IPCResponse
 */
export type IPCResponse = Message<"tokagent.v1.IPCResponse"> & {
    /**
     * @generated from oneof tokagent.v1.IPCResponse.response
     */
    response: {
        /**
         * @generated from field: tokagent.v1.ActionResultResponse action_result = 1;
         */
        value: ActionResultResponse;
        case: "actionResult";
    } | {
        /**
         * @generated from field: tokagent.v1.ValidationResponse validation = 2;
         */
        value: ValidationResponse;
        case: "validation";
    } | {
        /**
         * @generated from field: tokagent.v1.ProviderResultResponse provider_result = 3;
         */
        value: ProviderResultResponse;
        case: "providerResult";
    } | {
        /**
         * @generated from field: tokagent.v1.ServiceResponse service = 4;
         */
        value: ServiceResponse;
        case: "service";
    } | {
        /**
         * @generated from field: tokagent.v1.RouteHandlerResponse route = 5;
         */
        value: RouteHandlerResponse;
        case: "route";
    } | {
        /**
         * @generated from field: tokagent.v1.PluginInitResponse plugin_init = 6;
         */
        value: PluginInitResponse;
        case: "pluginInit";
    } | {
        /**
         * @generated from field: tokagent.v1.ErrorResponse error = 7;
         */
        value: ErrorResponse;
        case: "error";
    } | {
        case: undefined;
        value?: undefined;
    };
};
/**
 * Describes the message tokagent.v1.IPCResponse.
 * Use `create(IPCResponseSchema)` to create a new message.
 */
export declare const IPCResponseSchema: GenMessage<IPCResponse>;
/**
 * Interop protocol enumeration
 *
 * @generated from enum tokagent.v1.InteropProtocol
 */
export declare enum InteropProtocol {
    /**
     * @generated from enum value: INTEROP_PROTOCOL_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: INTEROP_PROTOCOL_WASM = 1;
     */
    WASM = 1,
    /**
     * @generated from enum value: INTEROP_PROTOCOL_FFI = 2;
     */
    FFI = 2,
    /**
     * @generated from enum value: INTEROP_PROTOCOL_IPC = 3;
     */
    IPC = 3,
    /**
     * @generated from enum value: INTEROP_PROTOCOL_NATIVE = 4;
     */
    NATIVE = 4
}
/**
 * Describes the enum tokagent.v1.InteropProtocol.
 */
export declare const InteropProtocolSchema: GenEnum<InteropProtocol>;
/**
 * Plugin language enumeration
 *
 * @generated from enum tokagent.v1.PluginLanguage
 */
export declare enum PluginLanguage {
    /**
     * @generated from enum value: PLUGIN_LANGUAGE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: PLUGIN_LANGUAGE_TYPESCRIPT = 1;
     */
    TYPESCRIPT = 1,
    /**
     * @generated from enum value: PLUGIN_LANGUAGE_RUST = 2;
     */
    RUST = 2,
    /**
     * @generated from enum value: PLUGIN_LANGUAGE_PYTHON = 3;
     */
    PYTHON = 3
}
/**
 * Describes the enum tokagent.v1.PluginLanguage.
 */
export declare const PluginLanguageSchema: GenEnum<PluginLanguage>;
//# sourceMappingURL=ipc_pb.d.ts.map