import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/tee.proto.
 */
export declare const file_tokagent_v1_tee: GenFile;
/**
 * Registration details for an agent within a TEE context.
 *
 * @generated from message tokagent.v1.TeeAgent
 */
export type TeeAgent = Message<"tokagent.v1.TeeAgent"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string agent_id = 2;
     */
    agentId: string;
    /**
     * @generated from field: string agent_name = 3;
     */
    agentName: string;
    /**
     * @generated from field: int64 created_at = 4;
     */
    createdAt: bigint;
    /**
     * @generated from field: string public_key = 5;
     */
    publicKey: string;
    /**
     * @generated from field: string attestation = 6;
     */
    attestation: string;
};
/**
 * Describes the message tokagent.v1.TeeAgent.
 * Use `create(TeeAgentSchema)` to create a new message.
 */
export declare const TeeAgentSchema: GenMessage<TeeAgent>;
/**
 * Quote obtained during remote attestation.
 *
 * @generated from message tokagent.v1.RemoteAttestationQuote
 */
export type RemoteAttestationQuote = Message<"tokagent.v1.RemoteAttestationQuote"> & {
    /**
     * @generated from field: string quote = 1;
     */
    quote: string;
    /**
     * @generated from field: int64 timestamp = 2;
     */
    timestamp: bigint;
};
/**
 * Describes the message tokagent.v1.RemoteAttestationQuote.
 * Use `create(RemoteAttestationQuoteSchema)` to create a new message.
 */
export declare const RemoteAttestationQuoteSchema: GenMessage<RemoteAttestationQuote>;
/**
 * Data used to derive a key within a TEE.
 *
 * @generated from message tokagent.v1.DeriveKeyAttestationData
 */
export type DeriveKeyAttestationData = Message<"tokagent.v1.DeriveKeyAttestationData"> & {
    /**
     * @generated from field: string agent_id = 1;
     */
    agentId: string;
    /**
     * @generated from field: string public_key = 2;
     */
    publicKey: string;
    /**
     * @generated from field: optional string subject = 3;
     */
    subject?: string;
};
/**
 * Describes the message tokagent.v1.DeriveKeyAttestationData.
 * Use `create(DeriveKeyAttestationDataSchema)` to create a new message.
 */
export declare const DeriveKeyAttestationDataSchema: GenMessage<DeriveKeyAttestationData>;
/**
 * Message content attested by a TEE.
 *
 * @generated from message tokagent.v1.AttestedMessage
 */
export type AttestedMessage = Message<"tokagent.v1.AttestedMessage"> & {
    /**
     * @generated from field: string entity_id = 1;
     */
    entityId: string;
    /**
     * @generated from field: string room_id = 2;
     */
    roomId: string;
    /**
     * @generated from field: string content = 3;
     */
    content: string;
};
/**
 * Describes the message tokagent.v1.AttestedMessage.
 * Use `create(AttestedMessageSchema)` to create a new message.
 */
export declare const AttestedMessageSchema: GenMessage<AttestedMessage>;
/**
 * Represents a message that has been attested by a TEE.
 *
 * @generated from message tokagent.v1.RemoteAttestationMessage
 */
export type RemoteAttestationMessage = Message<"tokagent.v1.RemoteAttestationMessage"> & {
    /**
     * @generated from field: string agent_id = 1;
     */
    agentId: string;
    /**
     * @generated from field: int64 timestamp = 2;
     */
    timestamp: bigint;
    /**
     * @generated from field: tokagent.v1.AttestedMessage message = 3;
     */
    message?: AttestedMessage;
};
/**
 * Describes the message tokagent.v1.RemoteAttestationMessage.
 * Use `create(RemoteAttestationMessageSchema)` to create a new message.
 */
export declare const RemoteAttestationMessageSchema: GenMessage<RemoteAttestationMessage>;
/**
 * Configuration for a TEE plugin.
 *
 * @generated from message tokagent.v1.TeePluginConfig
 */
export type TeePluginConfig = Message<"tokagent.v1.TeePluginConfig"> & {
    /**
     * @generated from field: optional string vendor = 1;
     */
    vendor?: string;
    /**
     * @generated from field: google.protobuf.Struct vendor_config = 2;
     */
    vendorConfig?: JsonObject;
};
/**
 * Describes the message tokagent.v1.TeePluginConfig.
 * Use `create(TeePluginConfigSchema)` to create a new message.
 */
export declare const TeePluginConfigSchema: GenMessage<TeePluginConfig>;
/**
 * Operational modes for a TEE.
 *
 * @generated from enum tokagent.v1.TEEMode
 */
export declare enum TEEMode {
    /**
     * @generated from enum value: TEE_MODE_UNSPECIFIED = 0;
     */
    TEE_MODE_UNSPECIFIED = 0,
    /**
     * @generated from enum value: TEE_MODE_OFF = 1;
     */
    TEE_MODE_OFF = 1,
    /**
     * @generated from enum value: TEE_MODE_LOCAL = 2;
     */
    TEE_MODE_LOCAL = 2,
    /**
     * @generated from enum value: TEE_MODE_DOCKER = 3;
     */
    TEE_MODE_DOCKER = 3,
    /**
     * @generated from enum value: TEE_MODE_PRODUCTION = 4;
     */
    TEE_MODE_PRODUCTION = 4
}
/**
 * Describes the enum tokagent.v1.TEEMode.
 */
export declare const TEEModeSchema: GenEnum<TEEMode>;
/**
 * Types or vendors of TEEs.
 *
 * @generated from enum tokagent.v1.TeeType
 */
export declare enum TeeType {
    /**
     * @generated from enum value: TEE_TYPE_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: TEE_TYPE_TDX_DSTACK = 1;
     */
    TDX_DSTACK = 1
}
/**
 * Describes the enum tokagent.v1.TeeType.
 */
export declare const TeeTypeSchema: GenEnum<TeeType>;
//# sourceMappingURL=tee_pb.d.ts.map