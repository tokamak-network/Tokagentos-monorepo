import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { JsonObject, Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/environment.proto.
 */
export declare const file_tokagent_v1_environment: GenFile;
/**
 * Entity component - extensible data attached to entities
 *
 * @generated from message tokagent.v1.Component
 */
export type Component = Message<"tokagent.v1.Component"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string entity_id = 2;
     */
    entityId: string;
    /**
     * @generated from field: string agent_id = 3;
     */
    agentId: string;
    /**
     * @generated from field: string room_id = 4;
     */
    roomId: string;
    /**
     * @generated from field: string world_id = 5;
     */
    worldId: string;
    /**
     * @generated from field: string source_entity_id = 6;
     */
    sourceEntityId: string;
    /**
     * @generated from field: string type = 7;
     */
    type: string;
    /**
     * @generated from field: int64 created_at = 8;
     */
    createdAt: bigint;
    /**
     * @generated from field: google.protobuf.Struct data = 9;
     */
    data?: JsonObject;
};
/**
 * Describes the message tokagent.v1.Component.
 * Use `create(ComponentSchema)` to create a new message.
 */
export declare const ComponentSchema: GenMessage<Component>;
/**
 * Represents an entity (user, agent, or other actor)
 *
 * @generated from message tokagent.v1.Entity
 */
export type Entity = Message<"tokagent.v1.Entity"> & {
    /**
     * Unique identifier, optional on creation
     *
     * @generated from field: optional string id = 1;
     */
    id?: string;
    /**
     * Names of the entity
     *
     * @generated from field: repeated string names = 2;
     */
    names: string[];
    /**
     * Additional metadata
     *
     * @generated from field: google.protobuf.Struct metadata = 3;
     */
    metadata?: JsonObject;
    /**
     * Agent ID this entity is related to
     *
     * @generated from field: string agent_id = 4;
     */
    agentId: string;
    /**
     * Optional array of components
     *
     * @generated from field: repeated tokagent.v1.Component components = 5;
     */
    components: Component[];
};
/**
 * Describes the message tokagent.v1.Entity.
 * Use `create(EntitySchema)` to create a new message.
 */
export declare const EntitySchema: GenMessage<Entity>;
/**
 * World ownership metadata
 *
 * @generated from message tokagent.v1.WorldOwnership
 */
export type WorldOwnership = Message<"tokagent.v1.WorldOwnership"> & {
    /**
     * @generated from field: string owner_id = 1;
     */
    ownerId: string;
};
/**
 * Describes the message tokagent.v1.WorldOwnership.
 * Use `create(WorldOwnershipSchema)` to create a new message.
 */
export declare const WorldOwnershipSchema: GenMessage<WorldOwnership>;
/**
 * World metadata
 *
 * @generated from message tokagent.v1.WorldMetadata
 */
export type WorldMetadata = Message<"tokagent.v1.WorldMetadata"> & {
    /**
     * @generated from field: optional tokagent.v1.WorldOwnership ownership = 1;
     */
    ownership?: WorldOwnership;
    /**
     * Role assignments keyed by entity ID
     *
     * @generated from field: map<string, string> roles = 2;
     */
    roles: {
        [key: string]: string;
    };
    /**
     * Additional dynamic metadata
     *
     * @generated from field: google.protobuf.Struct extra = 3;
     */
    extra?: JsonObject;
};
/**
 * Describes the message tokagent.v1.WorldMetadata.
 * Use `create(WorldMetadataSchema)` to create a new message.
 */
export declare const WorldMetadataSchema: GenMessage<WorldMetadata>;
/**
 * Represents a world (server, guild, or top-level container)
 *
 * @generated from message tokagent.v1.World
 */
export type World = Message<"tokagent.v1.World"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: optional string name = 2;
     */
    name?: string;
    /**
     * @generated from field: string agent_id = 3;
     */
    agentId: string;
    /**
     * @generated from field: optional string message_server_id = 4;
     */
    messageServerId?: string;
    /**
     * @generated from field: optional tokagent.v1.WorldMetadata metadata = 5;
     */
    metadata?: WorldMetadata;
};
/**
 * Describes the message tokagent.v1.World.
 * Use `create(WorldSchema)` to create a new message.
 */
export declare const WorldSchema: GenMessage<World>;
/**
 * Room metadata (dynamic key-value pairs)
 *
 * @generated from message tokagent.v1.RoomMetadata
 */
export type RoomMetadata = Message<"tokagent.v1.RoomMetadata"> & {
    /**
     * @generated from field: google.protobuf.Struct values = 1;
     */
    values?: JsonObject;
};
/**
 * Describes the message tokagent.v1.RoomMetadata.
 * Use `create(RoomMetadataSchema)` to create a new message.
 */
export declare const RoomMetadataSchema: GenMessage<RoomMetadata>;
/**
 * Represents a room (channel, chat, or conversation container)
 *
 * @generated from message tokagent.v1.Room
 */
export type Room = Message<"tokagent.v1.Room"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: optional string name = 2;
     */
    name?: string;
    /**
     * @generated from field: optional string agent_id = 3;
     */
    agentId?: string;
    /**
     * @generated from field: string source = 4;
     */
    source: string;
    /**
     * @generated from field: string type = 5;
     */
    type: string;
    /**
     * @generated from field: optional string channel_id = 6;
     */
    channelId?: string;
    /**
     * @generated from field: optional string message_server_id = 7;
     */
    messageServerId?: string;
    /**
     * @generated from field: optional string world_id = 8;
     */
    worldId?: string;
    /**
     * @generated from field: optional tokagent.v1.RoomMetadata metadata = 9;
     */
    metadata?: RoomMetadata;
};
/**
 * Describes the message tokagent.v1.Room.
 * Use `create(RoomSchema)` to create a new message.
 */
export declare const RoomSchema: GenMessage<Room>;
/**
 * Room participant with entity details
 *
 * @generated from message tokagent.v1.Participant
 */
export type Participant = Message<"tokagent.v1.Participant"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: tokagent.v1.Entity entity = 2;
     */
    entity?: Entity;
};
/**
 * Describes the message tokagent.v1.Participant.
 * Use `create(ParticipantSchema)` to create a new message.
 */
export declare const ParticipantSchema: GenMessage<Participant>;
/**
 * Represents a relationship between entities
 *
 * @generated from message tokagent.v1.Relationship
 */
export type Relationship = Message<"tokagent.v1.Relationship"> & {
    /**
     * @generated from field: string id = 1;
     */
    id: string;
    /**
     * @generated from field: string source_entity_id = 2;
     */
    sourceEntityId: string;
    /**
     * @generated from field: string target_entity_id = 3;
     */
    targetEntityId: string;
    /**
     * @generated from field: string agent_id = 4;
     */
    agentId: string;
    /**
     * @generated from field: repeated string tags = 5;
     */
    tags: string[];
    /**
     * @generated from field: google.protobuf.Struct metadata = 6;
     */
    metadata?: JsonObject;
    /**
     * @generated from field: optional string created_at = 7;
     */
    createdAt?: string;
};
/**
 * Describes the message tokagent.v1.Relationship.
 * Use `create(RelationshipSchema)` to create a new message.
 */
export declare const RelationshipSchema: GenMessage<Relationship>;
//# sourceMappingURL=environment_pb.d.ts.map