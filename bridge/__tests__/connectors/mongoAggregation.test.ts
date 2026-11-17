import { describe, expect, test, jest } from "@jest/globals";
import { MongoClient } from "mongodb";
import {
  assertReadOnlyPipeline,
  assertSafeExpressions,
  mongoConnector,
} from "../../src/connectors/mongo";
import { MAX_AGG_STAGES, MAX_EXPRESSION_DEPTH } from "../../src/types/mongo";
import type { EJSONDocument, MongoConfig } from "../../src/types/mongo";

describe("assertReadOnlyPipeline & assertSafeExpressions", () => {
  describe("Empty and basic valid pipelines", () => {
    test("accepts empty pipeline [] without error", () => {
      expect(() => assertReadOnlyPipeline([])).not.toThrow();
    });

    test("accepts standard read-only stages", () => {
      const pipeline: EJSONDocument[] = [
        { $match: { status: "active", age: { $gt: 18 } } },
        { $project: { name: 1, email: 1, _id: 0 } },
        { $sort: { createdAt: -1 } },
        { $limit: 10 },
        { $skip: 5 },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).not.toThrow();
    });
  });

  describe("Rejection of top-level write stages", () => {
    test("rejects $out with MONGO_WRITE_STAGE_FORBIDDEN", () => {
      expect(() => assertReadOnlyPipeline([{ $out: "target_coll" }])).toThrow(
        expect.objectContaining({
          code: "MONGO_WRITE_STAGE_FORBIDDEN",
          message: "Stage '$out' is forbidden in read-only aggregation queries",
        }),
      );
    });

    test("rejects $merge with MONGO_WRITE_STAGE_FORBIDDEN", () => {
      expect(() => assertReadOnlyPipeline([{ $merge: { into: "target_coll" } }])).toThrow(
        expect.objectContaining({
          code: "MONGO_WRITE_STAGE_FORBIDDEN",
          message: "Stage '$merge' is forbidden in read-only aggregation queries",
        }),
      );
    });
  });

  describe("Rejection of nested write stages in sub-pipelines", () => {
    test("rejects nested $out in $lookup.pipeline", () => {
      const pipeline: EJSONDocument[] = [
        {
          $lookup: {
            from: "orders",
            pipeline: [{ $out: "target" }],
            as: "orders",
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_WRITE_STAGE_FORBIDDEN",
          message: "Stage '$out' is forbidden in read-only aggregation queries",
        }),
      );
    });

    test("rejects nested $merge in $facet sub-pipelines", () => {
      const pipeline: EJSONDocument[] = [
        {
          $facet: {
            categorizedByTags: [{ $match: { tags: "sale" } }],
            categorizedByPrice: [{ $merge: { into: "output_coll" } }],
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_WRITE_STAGE_FORBIDDEN",
          message: "Stage '$merge' is forbidden in read-only aggregation queries",
        }),
      );
    });

    test("rejects nested $out in $unionWith.pipeline", () => {
      const pipeline: EJSONDocument[] = [
        {
          $unionWith: {
            coll: "archive",
            pipeline: [{ $out: "archive_dump" }],
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_WRITE_STAGE_FORBIDDEN",
          message: "Stage '$out' is forbidden in read-only aggregation queries",
        }),
      );
    });
  });

  describe("Rejection of forbidden server-side JavaScript expression operators", () => {
    test("rejects $function in expressions with MONGO_FORBIDDEN_OPERATOR", () => {
      const pipeline: EJSONDocument[] = [
        {
          $addFields: {
            fn: {
              $function: {
                body: "function() { return 1; }",
                args: [],
                lang: "js",
              },
            },
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message:
            "Operator '$function' is forbidden (server-side JavaScript execution is not permitted)",
        }),
      );
    });

    test("rejects $accumulator in $group stage with MONGO_FORBIDDEN_OPERATOR", () => {
      const pipeline: EJSONDocument[] = [
        {
          $group: {
            _id: null,
            custom: {
              $accumulator: {
                init: "function() { return 0; }",
                accumulate: "function(s) { return s + 1; }",
              },
            },
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message:
            "Operator '$accumulator' is forbidden (server-side JavaScript execution is not permitted)",
        }),
      );
    });

    test("rejects $where in $match stage with MONGO_FORBIDDEN_OPERATOR", () => {
      const pipeline: EJSONDocument[] = [
        {
          $match: {
            $where: "this.credits === this.debits",
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message:
            "Operator '$where' is forbidden (server-side JavaScript execution is not permitted)",
        }),
      );
    });

    test("rejects forbidden operators nested in $lookup sub-pipelines", () => {
      const pipeline: EJSONDocument[] = [
        {
          $lookup: {
            from: "details",
            pipeline: [
              {
                $match: {
                  $where: "this.active === true",
                },
              },
            ],
            as: "matched",
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message:
            "Operator '$where' is forbidden (server-side JavaScript execution is not permitted)",
        }),
      );
    });
  });

  describe("Validation of malformed stages and sub-pipelines", () => {
    test("rejects non-array pipeline with MONGO_INVALID_PIPELINE", () => {
      expect(() => assertReadOnlyPipeline("not an array" as any)).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "Pipeline must be an array",
        }),
      );
    });

    test("rejects non-object stage with MONGO_INVALID_PIPELINE", () => {
      expect(() => assertReadOnlyPipeline([null as any])).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "Each pipeline stage must be a non-null object",
        }),
      );
      expect(() => assertReadOnlyPipeline([[1, 2] as any])).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "Each pipeline stage must be a non-null object",
        }),
      );
    });

    test("rejects stage with zero keys or multiple keys", () => {
      expect(() => assertReadOnlyPipeline([{}])).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "Each pipeline stage must have exactly one operator key",
        }),
      );
      expect(() => assertReadOnlyPipeline([{ $match: {}, $sort: {} }])).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "Each pipeline stage must have exactly one operator key",
        }),
      );
    });

    test("rejects stage key not starting with $", () => {
      expect(() => assertReadOnlyPipeline([{ match: {} }])).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "Invalid stage name 'match'; must begin with '$'",
        }),
      );
    });

    test("rejects non-array $lookup.pipeline", () => {
      const pipeline: EJSONDocument[] = [
        {
          $lookup: {
            from: "orders",
            pipeline: "invalid_string" as any,
            as: "orders",
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "$lookup.pipeline must be an array",
        }),
      );
    });

    test("rejects non-array $unionWith.pipeline", () => {
      const pipeline: EJSONDocument[] = [
        {
          $unionWith: {
            coll: "archive",
            pipeline: { invalid: "obj" } as any,
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "$unionWith.pipeline must be an array",
        }),
      );
    });

    test("rejects non-array $facet sub-pipeline", () => {
      const pipeline: EJSONDocument[] = [
        {
          $facet: {
            invalidBranch: 12345 as any,
          },
        },
      ];
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "$facet pipeline for 'invalidBranch' must be an array",
        }),
      );
    });

    test("rejects malformed $facet stage specifications", () => {
      for (const badFacet of [[], "str", null]) {
        expect(() => assertReadOnlyPipeline([{ $facet: badFacet as any }])).toThrow(
          expect.objectContaining({
            code: "MONGO_INVALID_PIPELINE",
            message: "$facet stage specification must be an object",
          }),
        );
      }
      expect(() => assertReadOnlyPipeline([{ $facet: { f: "not-array" } as any }])).toThrow(
        expect.objectContaining({
          code: "MONGO_INVALID_PIPELINE",
          message: "$facet pipeline for 'f' must be an array",
        }),
      );
    });
  });

  describe("Nesting depth and resource limits", () => {
    test("rejects pipeline exceeding MAX_AGG_STAGES (64)", () => {
      const pipeline = Array.from({ length: 65 }, () => ({ $match: { a: 1 } }));
      expect(() => assertReadOnlyPipeline(pipeline)).toThrow(
        expect.objectContaining({
          code: "MONGO_LIMIT_EXCEEDED",
          message: `Pipeline exceeds ${MAX_AGG_STAGES} stages`,
        }),
      );
    });

    test("rejects stage exceeding MAX_AGG_STAGE_SIZE_BYTES (16KB)", () => {
      const largeStage = {
        $match: {
          data: "x".repeat(20 * 1024),
        },
      };
      expect(() => assertReadOnlyPipeline([largeStage])).toThrow(
        expect.objectContaining({
          code: "MONGO_LIMIT_EXCEEDED",
        }),
      );
    });

    test("rejects expression nesting depth > 15 with MONGO_LIMIT_EXCEEDED", () => {
      let nested: any = { value: 1 };
      for (let i = 0; i <= MAX_EXPRESSION_DEPTH + 1; i++) {
        nested = { child: nested };
      }
      expect(() => assertSafeExpressions(nested)).toThrow(
        expect.objectContaining({
          code: "MONGO_LIMIT_EXCEEDED",
          message: `Expression nesting exceeds maximum depth of ${MAX_EXPRESSION_DEPTH}`,
        }),
      );
    });

    test("rejects deeply nested sub-pipelines with MONGO_LIMIT_EXCEEDED", () => {
      let inner: any = [{ $match: { final: true } }];
      for (let i = 0; i < 16; i++) {
        inner = [
          {
            $lookup: {
              from: "coll",
              pipeline: inner,
              as: `as_${i}`,
            },
          },
        ];
      }
      expect(() => assertReadOnlyPipeline(inner)).toThrow(
        expect.objectContaining({
          code: "MONGO_LIMIT_EXCEEDED",
        }),
      );
    });
  });

  describe("runAggregation bounded cursor iteration and option validation", () => {
    const dummyConfig: MongoConfig = {
      uri: "mongodb://localhost:27017/testdb",
      database: "testdb",
    };

    test("rejects invalid maxTimeMS (0, negative, non-integer) with MONGO_VALIDATION_ERROR", async () => {
      for (const badTimeout of [0, -100, 1.5, NaN, "fast" as any]) {
        await expect(
          mongoConnector.runAggregation(dummyConfig, {
            collection: "orders",
            pipeline: [],
            options: { maxTimeMS: badTimeout },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: "maxTimeMS must be a positive integer",
        });
      }
    });

    test("clamps maxTimeMS between 1 and 60000", async () => {
      let capturedOptions: any;
      const mockCursor = {
        [Symbol.asyncIterator]: async function* () {},
        close: jest.fn().mockImplementation(() => Promise.resolve()),
      };
      const mockCollection = {
        aggregate: jest.fn().mockImplementation((_stages, options) => {
          capturedOptions = options;
          return mockCursor;
        }),
      };
      jest.spyOn(MongoClient.prototype, "db").mockReturnValue({
        collection: () => mockCollection,
      } as any);

      await mongoConnector.runAggregation(dummyConfig, {
        collection: "orders",
        pipeline: [],
        options: { maxTimeMS: 999999 },
      });
      expect(capturedOptions.maxTimeMS).toBe(60000);

      await mongoConnector.runAggregation(dummyConfig, {
        collection: "orders",
        pipeline: [],
        options: { maxTimeMS: 25000 },
      });
      expect(capturedOptions.maxTimeMS).toBe(25000);
    });

    test("terminates iteration at 1,001 documents, throws MONGO_LIMIT_EXCEEDED, and closes cursor", async () => {
      let iteratedCount = 0;
      const mockCursor = {
        [Symbol.asyncIterator]: async function* () {
          for (let i = 1; i <= 1050; i++) {
            iteratedCount++;
            yield { _id: i, name: `doc_${i}` };
          }
        },
        close: jest.fn().mockImplementation(() => Promise.resolve()),
      };
      const mockCollection = {
        aggregate: jest.fn().mockReturnValue(mockCursor),
      };
      jest.spyOn(MongoClient.prototype, "db").mockReturnValue({
        collection: () => mockCollection,
      } as any);

      await expect(
        mongoConnector.runAggregation(dummyConfig, {
          collection: "orders",
          pipeline: [{ $match: {} }],
        }),
      ).rejects.toMatchObject({
        code: "MONGO_LIMIT_EXCEEDED",
        message: "aggregation returned more than 1000 documents (max 1000); add a $limit stage",
      });

      expect(iteratedCount).toBe(1001);
      expect(mockCursor.close).toHaveBeenCalledTimes(1);
    });

    test("passes validated allowDiskUse and batchSize options to driver cursor", async () => {
      let capturedOptions: any;
      const mockCursor = {
        [Symbol.asyncIterator]: async function* () {
          yield { _id: 1 };
        },
        close: jest.fn().mockImplementation(() => Promise.resolve()),
      };
      const mockCollection = {
        aggregate: jest.fn().mockImplementation((_stages, options) => {
          capturedOptions = options;
          return mockCursor;
        }),
      };
      jest.spyOn(MongoClient.prototype, "db").mockReturnValue({
        collection: () => mockCollection,
      } as any);

      const res = await mongoConnector.runAggregation(dummyConfig, {
        collection: "orders",
        pipeline: [],
        options: { allowDiskUse: true, batchSize: 50 },
      });

      expect(capturedOptions.allowDiskUse).toBe(true);
      expect(capturedOptions.batchSize).toBe(50);
      expect(res.documents).toHaveLength(1);
    });
  });
});
