import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/payment.proto.
 */
export declare const file_tokagent_v1_payment: GenFile;
/**
 * Payment configuration definition for x402-enabled routes
 *
 * @generated from message tokagent.v1.PaymentConfigDefinition
 */
export type PaymentConfigDefinition = Message<"tokagent.v1.PaymentConfigDefinition"> & {
    /**
     * @generated from field: string network = 1;
     */
    network: string;
    /**
     * @generated from field: string asset_namespace = 2;
     */
    assetNamespace: string;
    /**
     * @generated from field: string asset_reference = 3;
     */
    assetReference: string;
    /**
     * @generated from field: string payment_address = 4;
     */
    paymentAddress: string;
    /**
     * @generated from field: string symbol = 5;
     */
    symbol: string;
    /**
     * @generated from field: optional string chain_id = 6;
     */
    chainId?: string;
};
/**
 * Describes the message tokagent.v1.PaymentConfigDefinition.
 * Use `create(PaymentConfigDefinitionSchema)` to create a new message.
 */
export declare const PaymentConfigDefinitionSchema: GenMessage<PaymentConfigDefinition>;
/**
 * x402 configuration for a paid route
 *
 * @generated from message tokagent.v1.X402Config
 */
export type X402Config = Message<"tokagent.v1.X402Config"> & {
    /**
     * @generated from field: uint32 price_in_cents = 1;
     */
    priceInCents: number;
    /**
     * @generated from field: repeated string payment_configs = 2;
     */
    paymentConfigs: string[];
};
/**
 * Describes the message tokagent.v1.X402Config.
 * Use `create(X402ConfigSchema)` to create a new message.
 */
export declare const X402ConfigSchema: GenMessage<X402Config>;
/**
 * x402 "accepts" entry describing payment terms
 *
 * @generated from message tokagent.v1.X402Accepts
 */
export type X402Accepts = Message<"tokagent.v1.X402Accepts"> & {
    /**
     * @generated from field: string scheme = 1;
     */
    scheme: string;
    /**
     * @generated from field: string network = 2;
     */
    network: string;
    /**
     * @generated from field: string max_amount_required = 3;
     */
    maxAmountRequired: string;
    /**
     * @generated from field: string resource = 4;
     */
    resource: string;
    /**
     * @generated from field: string description = 5;
     */
    description: string;
    /**
     * @generated from field: string mime_type = 6;
     */
    mimeType: string;
    /**
     * @generated from field: string pay_to = 7;
     */
    payTo: string;
    /**
     * @generated from field: uint32 max_timeout_seconds = 8;
     */
    maxTimeoutSeconds: number;
    /**
     * @generated from field: string asset = 9;
     */
    asset: string;
    /**
     * @generated from field: optional google.protobuf.Struct output_schema = 10;
     */
    outputSchema?: JsonObject;
    /**
     * @generated from field: optional google.protobuf.Struct extra = 11;
     */
    extra?: JsonObject;
};
/**
 * Describes the message tokagent.v1.X402Accepts.
 * Use `create(X402AcceptsSchema)` to create a new message.
 */
export declare const X402AcceptsSchema: GenMessage<X402Accepts>;
/**
 * x402 payment-required response payload
 *
 * @generated from message tokagent.v1.X402Response
 */
export type X402Response = Message<"tokagent.v1.X402Response"> & {
    /**
     * @generated from field: uint32 x402_version = 1;
     */
    x402Version: number;
    /**
     * @generated from field: optional string error = 2;
     */
    error?: string;
    /**
     * @generated from field: repeated tokagent.v1.X402Accepts accepts = 3;
     */
    accepts: X402Accepts[];
    /**
     * @generated from field: optional string payer = 4;
     */
    payer?: string;
};
/**
 * Describes the message tokagent.v1.X402Response.
 * Use `create(X402ResponseSchema)` to create a new message.
 */
export declare const X402ResponseSchema: GenMessage<X402Response>;
//# sourceMappingURL=payment_pb.d.ts.map