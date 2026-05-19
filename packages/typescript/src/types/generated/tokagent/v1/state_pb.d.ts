import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { ActionResult } from "./components_pb.js";
import type { Entity, Room, World } from "./environment_pb.js";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/state.proto.
 */
export declare const file_tokagent_v1_state: GenFile;
/**
 * Single step in an action plan
 *
 * @generated from message tokagent.v1.ActionPlanStep
 */
export type ActionPlanStep = Message<"tokagent.v1.ActionPlanStep"> & {
    /**
     * @generated from field: string action = 1;
     */
    action: string;
    /**
     * @generated from field: string status = 2;
     */
    status: string;
    /**
     * @generated from field: optional string error = 3;
     */
    error?: string;
    /**
     * @generated from field: optional tokagent.v1.ActionResult result = 4;
     */
    result?: ActionResult;
};
/**
 * Describes the message tokagent.v1.ActionPlanStep.
 * Use `create(ActionPlanStepSchema)` to create a new message.
 */
export declare const ActionPlanStepSchema: GenMessage<ActionPlanStep>;
/**
 * Multi-step action plan
 *
 * @generated from message tokagent.v1.ActionPlan
 */
export type ActionPlan = Message<"tokagent.v1.ActionPlan"> & {
    /**
     * @generated from field: string thought = 1;
     */
    thought: string;
    /**
     * @generated from field: int32 total_steps = 2;
     */
    totalSteps: number;
    /**
     * @generated from field: int32 current_step = 3;
     */
    currentStep: number;
    /**
     * @generated from field: repeated tokagent.v1.ActionPlanStep steps = 4;
     */
    steps: ActionPlanStep[];
    /**
     * @generated from field: google.protobuf.Struct metadata = 5;
     */
    metadata?: JsonObject;
};
/**
 * Describes the message tokagent.v1.ActionPlan.
 * Use `create(ActionPlanSchema)` to create a new message.
 */
export declare const ActionPlanSchema: GenMessage<ActionPlan>;
/**
 * Provider result cache entry
 *
 * @generated from message tokagent.v1.ProviderCacheEntry
 */
export type ProviderCacheEntry = Message<"tokagent.v1.ProviderCacheEntry"> & {
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
 * Describes the message tokagent.v1.ProviderCacheEntry.
 * Use `create(ProviderCacheEntrySchema)` to create a new message.
 */
export declare const ProviderCacheEntrySchema: GenMessage<ProviderCacheEntry>;
/**
 * Working memory item for multi-step action execution
 *
 * @generated from message tokagent.v1.WorkingMemoryItem
 */
export type WorkingMemoryItem = Message<"tokagent.v1.WorkingMemoryItem"> & {
    /**
     * Name of the action that created this entry
     *
     * @generated from field: string action_name = 1;
     */
    actionName: string;
    /**
     * Result from the action execution
     *
     * @generated from field: tokagent.v1.ActionResult result = 2;
     */
    result?: ActionResult;
    /**
     * Timestamp when the entry was created
     *
     * @generated from field: int64 timestamp = 3;
     */
    timestamp: bigint;
};
/**
 * Describes the message tokagent.v1.WorkingMemoryItem.
 * Use `create(WorkingMemoryItemSchema)` to create a new message.
 */
export declare const WorkingMemoryItemSchema: GenMessage<WorkingMemoryItem>;
/**
 * Structured data cached in state by providers and actions
 *
 * @generated from message tokagent.v1.StateData
 */
export type StateData = Message<"tokagent.v1.StateData"> & {
    /**
     * Cached room data from providers
     *
     * @generated from field: optional tokagent.v1.Room room = 1;
     */
    room?: Room;
    /**
     * Cached world data from providers
     *
     * @generated from field: optional tokagent.v1.World world = 2;
     */
    world?: World;
    /**
     * Cached entity data from providers
     *
     * @generated from field: optional tokagent.v1.Entity entity = 3;
     */
    entity?: Entity;
    /**
     * Provider results cache keyed by provider name
     *
     * @generated from field: map<string, tokagent.v1.ProviderCacheEntry> providers = 4;
     */
    providers: {
        [key: string]: ProviderCacheEntry;
    };
    /**
     * Current action plan for multi-step actions
     *
     * @generated from field: optional tokagent.v1.ActionPlan action_plan = 5;
     */
    actionPlan?: ActionPlan;
    /**
     * Results from previous action executions
     *
     * @generated from field: repeated tokagent.v1.ActionResult action_results = 6;
     */
    actionResults: ActionResult[];
    /**
     * Working memory for temporary state during multi-step action execution
     *
     * @generated from field: map<string, tokagent.v1.WorkingMemoryItem> working_memory = 7;
     */
    workingMemory: {
        [key: string]: WorkingMemoryItem;
    };
    /**
     * Dynamic properties for plugin extensions
     *
     * @generated from field: google.protobuf.Struct extra = 8;
     */
    extra?: JsonObject;
};
/**
 * Describes the message tokagent.v1.StateData.
 * Use `create(StateDataSchema)` to create a new message.
 */
export declare const StateDataSchema: GenMessage<StateData>;
/**
 * State values populated by providers
 *
 * @generated from message tokagent.v1.StateValues
 */
export type StateValues = Message<"tokagent.v1.StateValues"> & {
    /**
     * Agent name
     *
     * @generated from field: optional string agent_name = 1;
     */
    agentName?: string;
    /**
     * Action names available to the agent
     *
     * @generated from field: optional string action_names = 2;
     */
    actionNames?: string;
    /**
     * Provider names used
     *
     * @generated from field: optional string providers = 3;
     */
    providers?: string;
    /**
     * Other dynamic values
     *
     * @generated from field: google.protobuf.Struct extra = 4;
     */
    extra?: JsonObject;
};
/**
 * Describes the message tokagent.v1.StateValues.
 * Use `create(StateValuesSchema)` to create a new message.
 */
export declare const StateValuesSchema: GenMessage<StateValues>;
/**
 * Represents the current state or context of a conversation or agent interaction
 *
 * @generated from message tokagent.v1.State
 */
export type State = Message<"tokagent.v1.State"> & {
    /**
     * Key-value store for state variables populated by providers
     *
     * @generated from field: tokagent.v1.StateValues values = 1;
     */
    values?: StateValues;
    /**
     * Structured data cache with typed properties
     *
     * @generated from field: tokagent.v1.StateData data = 2;
     */
    data?: StateData;
    /**
     * String representation of the current context
     *
     * @generated from field: string text = 3;
     */
    text: string;
    /**
     * Dynamic properties for template expansion
     *
     * @generated from field: google.protobuf.Struct extra = 4;
     */
    extra?: JsonObject;
};
/**
 * Describes the message tokagent.v1.State.
 * Use `create(StateSchema)` to create a new message.
 */
export declare const StateSchema: GenMessage<State>;
//# sourceMappingURL=state_pb.d.ts.map