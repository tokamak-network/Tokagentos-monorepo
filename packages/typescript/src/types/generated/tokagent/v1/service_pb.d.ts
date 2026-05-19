import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/service.proto.
 */
export declare const file_tokagent_v1_service: GenFile;
/**
 * Service manifest (metadata only, for cross-language interop)
 *
 * @generated from message tokagent.v1.ServiceManifest
 */
export type ServiceManifest = Message<"tokagent.v1.ServiceManifest"> & {
    /**
     * @generated from field: tokagent.v1.ServiceType type = 1;
     */
    type: ServiceType;
    /**
     * @generated from field: optional string description = 2;
     */
    description?: string;
    /**
     * @generated from field: optional string capability_description = 3;
     */
    capabilityDescription?: string;
    /**
     * @generated from field: google.protobuf.Struct config = 4;
     */
    config?: JsonObject;
};
/**
 * Describes the message tokagent.v1.ServiceManifest.
 * Use `create(ServiceManifestSchema)` to create a new message.
 */
export declare const ServiceManifestSchema: GenMessage<ServiceManifest>;
/**
 * Standardized service error type
 *
 * @generated from message tokagent.v1.ServiceError
 */
export type ServiceError = Message<"tokagent.v1.ServiceError"> & {
    /**
     * @generated from field: string code = 1;
     */
    code: string;
    /**
     * @generated from field: string message = 2;
     */
    message: string;
    /**
     * @generated from field: google.protobuf.Struct details = 3;
     */
    details?: JsonObject;
    /**
     * @generated from field: optional string cause = 4;
     */
    cause?: string;
};
/**
 * Describes the message tokagent.v1.ServiceError.
 * Use `create(ServiceErrorSchema)` to create a new message.
 */
export declare const ServiceErrorSchema: GenMessage<ServiceError>;
/**
 * Service type enumeration
 *
 * @generated from enum tokagent.v1.ServiceType
 */
export declare enum ServiceType {
    /**
     * @generated from enum value: SERVICE_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: SERVICE_TYPE_TRANSCRIPTION = 1;
     */
    TRANSCRIPTION = 1,
    /**
     * @generated from enum value: SERVICE_TYPE_VIDEO = 2;
     */
    VIDEO = 2,
    /**
     * @generated from enum value: SERVICE_TYPE_BROWSER = 3;
     */
    BROWSER = 3,
    /**
     * @generated from enum value: SERVICE_TYPE_PDF = 4;
     */
    PDF = 4,
    /**
     * aws_s3
     *
     * @generated from enum value: SERVICE_TYPE_REMOTE_FILES = 5;
     */
    REMOTE_FILES = 5,
    /**
     * @generated from enum value: SERVICE_TYPE_WEB_SEARCH = 6;
     */
    WEB_SEARCH = 6,
    /**
     * @generated from enum value: SERVICE_TYPE_EMAIL = 7;
     */
    EMAIL = 7,
    /**
     * @generated from enum value: SERVICE_TYPE_TEE = 8;
     */
    TEE = 8,
    /**
     * @generated from enum value: SERVICE_TYPE_TASK = 9;
     */
    TASK = 9,
    /**
     * @generated from enum value: SERVICE_TYPE_WALLET = 10;
     */
    WALLET = 10,
    /**
     * @generated from enum value: SERVICE_TYPE_LP_POOL = 11;
     */
    LP_POOL = 11,
    /**
     * @generated from enum value: SERVICE_TYPE_TOKEN_DATA = 12;
     */
    TOKEN_DATA = 12,
    /**
     * @generated from enum value: SERVICE_TYPE_MESSAGE_SERVICE = 13;
     */
    MESSAGE_SERVICE = 13,
    /**
     * @generated from enum value: SERVICE_TYPE_MESSAGE = 14;
     */
    MESSAGE = 14,
    /**
     * @generated from enum value: SERVICE_TYPE_POST = 15;
     */
    POST = 15,
    /**
     * @generated from enum value: SERVICE_TYPE_UNKNOWN = 16;
     */
    UNKNOWN = 16
}
/**
 * Describes the enum tokagent.v1.ServiceType.
 */
export declare const ServiceTypeSchema: GenEnum<ServiceType>;
//# sourceMappingURL=service_pb.d.ts.map