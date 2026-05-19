import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/task.proto.
 */
export declare const file_tokagent_v1_task: GenFile;
/**
 * Task metadata
 *
 * @generated from message tokagent.v1.TaskMetadata
 */
export type TaskMetadata = Message<"tokagent.v1.TaskMetadata"> & {
    /**
     * Custom metadata values
     *
     * @generated from field: google.protobuf.Struct values = 1;
     */
    values?: JsonObject;
};
/**
 * Describes the message tokagent.v1.TaskMetadata.
 * Use `create(TaskMetadataSchema)` to create a new message.
 */
export declare const TaskMetadataSchema: GenMessage<TaskMetadata>;
/**
 * Represents a task
 *
 * @generated from message tokagent.v1.Task
 */
export type Task = Message<"tokagent.v1.Task"> & {
    /**
     * @generated from field: optional string id = 1;
     */
    id?: string;
    /**
     * @generated from field: string name = 2;
     */
    name: string;
    /**
     * @generated from field: optional string description = 3;
     */
    description?: string;
    /**
     * @generated from field: tokagent.v1.TaskStatus status = 4;
     */
    status: TaskStatus;
    /**
     * @generated from field: optional string room_id = 5;
     */
    roomId?: string;
    /**
     * @generated from field: optional string world_id = 6;
     */
    worldId?: string;
    /**
     * @generated from field: optional string entity_id = 7;
     */
    entityId?: string;
    /**
     * @generated from field: repeated string tags = 8;
     */
    tags: string[];
    /**
     * @generated from field: optional tokagent.v1.TaskMetadata metadata = 9;
     */
    metadata?: TaskMetadata;
    /**
     * @generated from field: optional int64 created_at = 10;
     */
    createdAt?: bigint;
    /**
     * @generated from field: optional int64 updated_at = 11;
     */
    updatedAt?: bigint;
    /**
     * @generated from field: optional int64 due_at = 12;
     */
    dueAt?: bigint;
};
/**
 * Describes the message tokagent.v1.Task.
 * Use `create(TaskSchema)` to create a new message.
 */
export declare const TaskSchema: GenMessage<Task>;
/**
 * Task status enumeration
 *
 * @generated from enum tokagent.v1.TaskStatus
 */
export declare enum TaskStatus {
    /**
     * @generated from enum value: TASK_STATUS_UNSPECIFIED = 0;
     */
    UNSPECIFIED = 0,
    /**
     * @generated from enum value: TASK_STATUS_PENDING = 1;
     */
    PENDING = 1,
    /**
     * @generated from enum value: TASK_STATUS_IN_PROGRESS = 2;
     */
    IN_PROGRESS = 2,
    /**
     * @generated from enum value: TASK_STATUS_COMPLETED = 3;
     */
    COMPLETED = 3,
    /**
     * @generated from enum value: TASK_STATUS_FAILED = 4;
     */
    FAILED = 4,
    /**
     * @generated from enum value: TASK_STATUS_CANCELLED = 5;
     */
    CANCELLED = 5
}
/**
 * Describes the enum tokagent.v1.TaskStatus.
 */
export declare const TaskStatusSchema: GenEnum<TaskStatus>;
//# sourceMappingURL=task_pb.d.ts.map