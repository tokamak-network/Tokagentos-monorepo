import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Character } from "./agent_pb.js";
import type { ActionManifest, EvaluatorManifest, ProviderManifest } from "./components_pb.js";
import type { X402Config } from "./payment_pb.js";
import type { ServiceManifest } from "./service_pb.js";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/plugin.proto.
 */
export declare const file_tokagent_v1_plugin: GenFile;
/**
 * Route manifest for plugin routes
 *
 * @generated from message tokagent.v1.RouteManifest
 */
export type RouteManifest = Message<"tokagent.v1.RouteManifest"> & {
    /**
     * @generated from field: tokagent.v1.HttpMethod method = 1;
     */
    method: HttpMethod;
    /**
     * @generated from field: string path = 2;
     */
    path: string;
    /**
     * @generated from field: optional string name = 3;
     */
    name?: string;
    /**
     * @generated from field: optional bool public = 4;
     */
    public?: boolean;
    /**
     * @generated from field: optional bool is_multipart = 5;
     */
    isMultipart?: boolean;
    /**
     * @generated from field: optional string file_path = 6;
     */
    filePath?: string;
    /**
     * @generated from field: optional tokagent.v1.X402Config x402 = 7;
     */
    x402?: X402Config;
};
/**
 * Describes the message tokagent.v1.RouteManifest.
 * Use `create(RouteManifestSchema)` to create a new message.
 */
export declare const RouteManifestSchema: GenMessage<RouteManifest>;
/**
 * JSON Schema type definition for component validation
 *
 * @generated from message tokagent.v1.JSONSchemaDefinition
 */
export type JSONSchemaDefinition = Message<"tokagent.v1.JSONSchemaDefinition"> & {
    /**
     * "string" | "number" | "boolean" | "object" | "array" | "null"
     *
     * @generated from field: string type = 1;
     */
    type: string;
    /**
     * @generated from field: map<string, tokagent.v1.JSONSchemaDefinition> properties = 2;
     */
    properties: {
        [key: string]: JSONSchemaDefinition;
    };
    /**
     * @generated from field: optional tokagent.v1.JSONSchemaDefinition items = 3;
     */
    items?: JSONSchemaDefinition;
    /**
     * @generated from field: repeated string required = 4;
     */
    required: string[];
    /**
     * @generated from field: repeated string enum_values = 5;
     */
    enumValues: string[];
    /**
     * @generated from field: optional string description = 6;
     */
    description?: string;
};
/**
 * Describes the message tokagent.v1.JSONSchemaDefinition.
 * Use `create(JSONSchemaDefinitionSchema)` to create a new message.
 */
export declare const JSONSchemaDefinitionSchema: GenMessage<JSONSchemaDefinition>;
/**
 * Component type definition for entity components
 *
 * @generated from message tokagent.v1.ComponentTypeDefinition
 */
export type ComponentTypeDefinition = Message<"tokagent.v1.ComponentTypeDefinition"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: tokagent.v1.JSONSchemaDefinition schema = 2;
     */
    schema?: JSONSchemaDefinition;
};
/**
 * Describes the message tokagent.v1.ComponentTypeDefinition.
 * Use `create(ComponentTypeDefinitionSchema)` to create a new message.
 */
export declare const ComponentTypeDefinitionSchema: GenMessage<ComponentTypeDefinition>;
/**
 * Plugin manifest (metadata for cross-language interop)
 *
 * @generated from message tokagent.v1.PluginManifest
 */
export type PluginManifest = Message<"tokagent.v1.PluginManifest"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
    /**
     * Plugin configuration
     *
     * @generated from field: map<string, string> config = 3;
     */
    config: {
        [key: string]: string;
    };
    /**
     * Component definitions
     *
     * @generated from field: repeated tokagent.v1.ActionManifest actions = 4;
     */
    actions: ActionManifest[];
    /**
     * @generated from field: repeated tokagent.v1.ProviderManifest providers = 5;
     */
    providers: ProviderManifest[];
    /**
     * @generated from field: repeated tokagent.v1.EvaluatorManifest evaluators = 6;
     */
    evaluators: EvaluatorManifest[];
    /**
     * @generated from field: repeated tokagent.v1.ServiceManifest services = 7;
     */
    services: ServiceManifest[];
    /**
     * @generated from field: repeated tokagent.v1.RouteManifest routes = 8;
     */
    routes: RouteManifest[];
    /**
     * @generated from field: repeated tokagent.v1.ComponentTypeDefinition component_types = 9;
     */
    componentTypes: ComponentTypeDefinition[];
    /**
     * Event handlers keyed by event type
     *
     * @generated from field: map<string, tokagent.v1.EventHandlerList> events = 10;
     */
    events: {
        [key: string]: EventHandlerList;
    };
    /**
     * Dependencies
     *
     * @generated from field: repeated string dependencies = 11;
     */
    dependencies: string[];
    /**
     * @generated from field: repeated string test_dependencies = 12;
     */
    testDependencies: string[];
    /**
     * Priority for plugin ordering
     *
     * @generated from field: optional int32 priority = 13;
     */
    priority?: number;
    /**
     * Custom schema for plugin-specific configuration
     *
     * @generated from field: google.protobuf.Struct schema = 14;
     */
    schema?: JsonObject;
};
/**
 * Describes the message tokagent.v1.PluginManifest.
 * Use `create(PluginManifestSchema)` to create a new message.
 */
export declare const PluginManifestSchema: GenMessage<PluginManifest>;
/**
 * List of event handler names
 *
 * @generated from message tokagent.v1.EventHandlerList
 */
export type EventHandlerList = Message<"tokagent.v1.EventHandlerList"> & {
    /**
     * @generated from field: repeated string handlers = 1;
     */
    handlers: string[];
};
/**
 * Describes the message tokagent.v1.EventHandlerList.
 * Use `create(EventHandlerListSchema)` to create a new message.
 */
export declare const EventHandlerListSchema: GenMessage<EventHandlerList>;
/**
 * Project agent configuration
 *
 * @generated from message tokagent.v1.ProjectAgentManifest
 */
export type ProjectAgentManifest = Message<"tokagent.v1.ProjectAgentManifest"> & {
    /**
     * @generated from field: tokagent.v1.Character character = 1;
     */
    character?: Character;
    /**
     * @generated from field: repeated string plugins = 2;
     */
    plugins: string[];
};
/**
 * Describes the message tokagent.v1.ProjectAgentManifest.
 * Use `create(ProjectAgentManifestSchema)` to create a new message.
 */
export declare const ProjectAgentManifestSchema: GenMessage<ProjectAgentManifest>;
/**
 * Project manifest
 *
 * @generated from message tokagent.v1.ProjectManifest
 */
export type ProjectManifest = Message<"tokagent.v1.ProjectManifest"> & {
    /**
     * @generated from field: repeated tokagent.v1.ProjectAgentManifest agents = 1;
     */
    agents: ProjectAgentManifest[];
};
/**
 * Describes the message tokagent.v1.ProjectManifest.
 * Use `create(ProjectManifestSchema)` to create a new message.
 */
export declare const ProjectManifestSchema: GenMessage<ProjectManifest>;
/**
 * HTTP method enumeration for routes
 *
 * @generated from enum tokagent.v1.HttpMethod
 */
export declare enum HttpMethod {
    /**
     * @generated from enum value: HTTP_METHOD_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: HTTP_METHOD_GET = 1;
     */
    GET = 1,
    /**
     * @generated from enum value: HTTP_METHOD_POST = 2;
     */
    POST = 2,
    /**
     * @generated from enum value: HTTP_METHOD_PUT = 3;
     */
    PUT = 3,
    /**
     * @generated from enum value: HTTP_METHOD_PATCH = 4;
     */
    PATCH = 4,
    /**
     * @generated from enum value: HTTP_METHOD_DELETE = 5;
     */
    DELETE = 5,
    /**
     * @generated from enum value: HTTP_METHOD_STATIC = 6;
     */
    STATIC = 6
}
/**
 * Describes the enum tokagent.v1.HttpMethod.
 */
export declare const HttpMethodSchema: GenEnum<HttpMethod>;
//# sourceMappingURL=plugin_pb.d.ts.map