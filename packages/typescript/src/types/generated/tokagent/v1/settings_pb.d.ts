import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Value } from "@bufbuild/protobuf/wkt";
import type { Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/settings.proto.
 */
export declare const file_tokagent_v1_settings: GenFile;
/**
 * Runtime settings provided as key/value strings (typically from env).
 *
 * @generated from message tokagent.v1.RuntimeSettings
 */
export type RuntimeSettings = Message<"tokagent.v1.RuntimeSettings"> & {
    /**
     * @generated from field: map<string, string> values = 1;
     */
    values: {
        [key: string]: string;
    };
};
/**
 * Describes the message tokagent.v1.RuntimeSettings.
 * Use `create(RuntimeSettingsSchema)` to create a new message.
 */
export declare const RuntimeSettingsSchema: GenMessage<RuntimeSettings>;
/**
 * Definition for a configurable setting (metadata only).
 *
 * @generated from message tokagent.v1.SettingDefinition
 */
export type SettingDefinition = Message<"tokagent.v1.SettingDefinition"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
    /**
     * @generated from field: string usage_description = 3;
     */
    usageDescription: string;
    /**
     * @generated from field: bool required = 4;
     */
    required: boolean;
    /**
     * @generated from field: optional bool public = 5;
     */
    public?: boolean;
    /**
     * @generated from field: optional bool secret = 6;
     */
    secret?: boolean;
    /**
     * @generated from field: repeated string depends_on = 7;
     */
    dependsOn: string[];
};
/**
 * Describes the message tokagent.v1.SettingDefinition.
 * Use `create(SettingDefinitionSchema)` to create a new message.
 */
export declare const SettingDefinitionSchema: GenMessage<SettingDefinition>;
/**
 * Concrete setting value (value may be string, bool, or null).
 *
 * @generated from message tokagent.v1.Setting
 */
export type Setting = Message<"tokagent.v1.Setting"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: string description = 2;
     */
    description: string;
    /**
     * @generated from field: string usage_description = 3;
     */
    usageDescription: string;
    /**
     * @generated from field: bool required = 4;
     */
    required: boolean;
    /**
     * @generated from field: optional bool public = 5;
     */
    public?: boolean;
    /**
     * @generated from field: optional bool secret = 6;
     */
    secret?: boolean;
    /**
     * @generated from field: repeated string depends_on = 7;
     */
    dependsOn: string[];
    /**
     * @generated from field: google.protobuf.Value value = 8;
     */
    value?: Value;
};
/**
 * Describes the message tokagent.v1.Setting.
 * Use `create(SettingSchema)` to create a new message.
 */
export declare const SettingSchema: GenMessage<Setting>;
/**
 * World settings configuration map.
 *
 * @generated from message tokagent.v1.WorldSettings
 */
export type WorldSettings = Message<"tokagent.v1.WorldSettings"> & {
    /**
     * @generated from field: map<string, tokagent.v1.Setting> settings = 1;
     */
    settings: {
        [key: string]: Setting;
    };
};
/**
 * Describes the message tokagent.v1.WorldSettings.
 * Use `create(WorldSettingsSchema)` to create a new message.
 */
export declare const WorldSettingsSchema: GenMessage<WorldSettings>;
/**
 * Onboarding configuration with setting definitions.
 *
 * @generated from message tokagent.v1.OnboardingConfig
 */
export type OnboardingConfig = Message<"tokagent.v1.OnboardingConfig"> & {
    /**
     * @generated from field: map<string, tokagent.v1.SettingDefinition> settings = 1;
     */
    settings: {
        [key: string]: SettingDefinition;
    };
};
/**
 * Describes the message tokagent.v1.OnboardingConfig.
 * Use `create(OnboardingConfigSchema)` to create a new message.
 */
export declare const OnboardingConfigSchema: GenMessage<OnboardingConfig>;
//# sourceMappingURL=settings_pb.d.ts.map