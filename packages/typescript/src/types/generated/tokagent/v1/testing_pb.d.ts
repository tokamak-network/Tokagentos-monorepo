import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv1";
import type { Message } from "@bufbuild/protobuf";
/**
 * Describes the file tokagent/v1/testing.proto.
 */
export declare const file_tokagent_v1_testing: GenFile;
/**
 * Represents a test case definition (handler is runtime-only).
 *
 * @generated from message tokagent.v1.TestCase
 */
export type TestCase = Message<"tokagent.v1.TestCase"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: optional string handler_id = 2;
     */
    handlerId?: string;
};
/**
 * Describes the message tokagent.v1.TestCase.
 * Use `create(TestCaseSchema)` to create a new message.
 */
export declare const TestCaseSchema: GenMessage<TestCase>;
/**
 * Represents a suite of related test cases.
 *
 * @generated from message tokagent.v1.TestSuite
 */
export type TestSuite = Message<"tokagent.v1.TestSuite"> & {
    /**
     * @generated from field: string name = 1;
     */
    name: string;
    /**
     * @generated from field: repeated tokagent.v1.TestCase tests = 2;
     */
    tests: TestCase[];
};
/**
 * Describes the message tokagent.v1.TestSuite.
 * Use `create(TestSuiteSchema)` to create a new message.
 */
export declare const TestSuiteSchema: GenMessage<TestSuite>;
//# sourceMappingURL=testing_pb.d.ts.map