import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseJsonArrayStream,
  parseNdjsonStream,
  parseCsvStream,
  createIncrementalChunkReader,
  previewImportFile,
  coerceCsvValue,
  setDottedPath,
} from "../utils/importReader";
import { ZeroDocumentImportError, ImportLimitExceededError } from "../utils/payloadAccounting";
import type { MongoBulkDocument } from "../types/bulk";

describe("MongoDB Bulk Import — Incremental Streaming Reader", () => {
  // =========================================================================
  // 1. JSON Array Streaming Parser & Grammar Invariants
  // =========================================================================
  describe("JSON Array Parser", () => {
    it("parses documents across small read slices (multibyte UTF-8, split tokens, escaped quotes)", async () => {
      const jsonContent = JSON.stringify([
        { id: 1, name: "Rocket 🚀", desc: 'Quote: "hello\\world"', count: 10 },
        { id: 2, name: "Tokyo 東京", active: true, tags: ["a", "b", "c"] },
        { id: 3, details: { nested: { deep: "value" } }, nullVal: null },
      ]);

      const file = new File([jsonContent], "test.json", { type: "application/json" });

      // Force slice size to 16 bytes to ensure tokens and UTF-8 code points span slice boundaries
      const docs: MongoBulkDocument[] = [];
      for await (const doc of parseJsonArrayStream(file, { sliceSize: 16 })) {
        docs.push(doc);
      }

      assert.strictEqual(docs.length, 3);
      assert.strictEqual(docs[0].name, "Rocket 🚀");
      assert.strictEqual(docs[0].desc, 'Quote: "hello\\world"');
      assert.strictEqual(docs[1].name, "Tokyo 東京");
      assert.deepStrictEqual(docs[1].tags, ["a", "b", "c"]);
      assert.deepStrictEqual(
        ((docs[2].details as MongoBulkDocument)?.nested as MongoBulkDocument)?.deep,
        "value",
      );
    });

    it("rejects non-array root (e.g. object root)", async () => {
      const file = new File(['{ "a": 1 }'], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Invalid JSON array: Expected '\['/);
    });

    it("rejects missing comma between root array elements", async () => {
      const file = new File(['[{"id": 1} {"id": 2}]'], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Syntax error: Missing comma separator between array elements/);
    });

    it("rejects trailing comma before closing bracket ]", async () => {
      const file = new File(['[{"id": 1},]'], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Syntax error: Trailing comma before ']' is not permitted/);
    });

    it("rejects unexpected non-whitespace content after root array closure", async () => {
      const file = new File(['[{"id": 1}] trailing garbage'], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Syntax error: Unexpected non-whitespace content after root array closure/);
    });

    it("rejects primitive elements in root array", async () => {
      const file = new File(['[{"id": 1}, 123]'], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Root array must contain only JSON objects; encountered primitive or array/);
    });

    it("rejects nested arrays at root level", async () => {
      const file = new File(["[[1, 2, 3]]"], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Root array must contain only JSON objects; encountered primitive or array/);
    });

    it("rejects prototype pollution attempts in JSON documents", async () => {
      const file = new File(['[{"name": "admin", "__proto__": {"polluted": true}}]'], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Prototype pollution attempt detected with property '__proto__'/);
    });

    it("rejects unexpected EOF during unclosed document", async () => {
      const file = new File(['[{"name": "unfinished"'], "test.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, /Unexpected end of input/);
    });
  });

  // =========================================================================
  // 2. NDJSON Streaming Parser
  // =========================================================================
  describe("NDJSON Parser", () => {
    it("parses NDJSON lines with LF and CRLF, skipping blank lines", async () => {
      const ndjson =
        '{"id": 1, "name": "Alice"}\r\n\n' +
        '{"id": 2, "name": "Bob"}\n\n' +
        '{"id": 3, "name": "Charlie"}';

      const file = new File([ndjson], "test.ndjson");
      const docs: MongoBulkDocument[] = [];
      for await (const doc of parseNdjsonStream(file, { sliceSize: 15 })) {
        docs.push(doc);
      }

      assert.strictEqual(docs.length, 3);
      assert.strictEqual(docs[0].name, "Alice");
      assert.strictEqual(docs[1].name, "Bob");
      assert.strictEqual(docs[2].name, "Charlie");
    });

    it("rejects non-object line in NDJSON", async () => {
      const ndjson = '{"id": 1}\n12345\n{"id": 3}';
      const file = new File([ndjson], "test.ndjson");
      await assert.rejects(async () => {
        for await (const _ of parseNdjsonStream(file)) {
          // no-op
        }
      }, /NDJSON line 2 must be a JSON object/);
    });

    it("rejects prototype pollution in NDJSON", async () => {
      const ndjson = '{"id": 1}\n{"constructor": {"evil": true}}';
      const file = new File([ndjson], "test.ndjson");
      await assert.rejects(async () => {
        for await (const _ of parseNdjsonStream(file)) {
          // no-op
        }
      }, /Prototype pollution attempt detected with property 'constructor'/);
    });
  });

  // =========================================================================
  // 3. CSV Streaming Parser & RFC 4180 Invariants
  // =========================================================================
  describe("CSV Parser", () => {
    it("parses RFC 4180 CSV with quotes, newlines in quotes, and un-flattens dotted headers", async () => {
      const csv =
        "id,user.name,user.address.city,notes,active,price,tags\n" +
        '1,Alice,"New York, NY","Multi\nline\nnote",true,19.99,"[""electronics"",""gadgets""]"\n' +
        '2,Bob,London,"Escaped ""quotes""",false,42,\n';

      const file = new File([csv], "test.csv");
      const results: MongoBulkDocument[] = [];
      for await (const item of parseCsvStream(file, { sliceSize: 20 })) {
        results.push(item.doc);
      }

      assert.strictEqual(results.length, 2);

      // Verify un-flattening
      assert.strictEqual(results[0].id, 1);
      const user0 = results[0].user as MongoBulkDocument;
      assert.strictEqual(user0?.name, "Alice");
      assert.strictEqual((user0?.address as MongoBulkDocument)?.city, "New York, NY");
      assert.strictEqual(results[0].notes, "Multi\nline\nnote");
      assert.strictEqual(results[0].active, true);
      assert.strictEqual(results[0].price, 19.99);
      assert.deepStrictEqual(results[0].tags, ["electronics", "gadgets"]);

      // Verify second row
      assert.strictEqual(results[1].id, 2);
      const user1 = results[1].user as MongoBulkDocument;
      assert.strictEqual(user1?.name, "Bob");
      assert.strictEqual(results[1].notes, 'Escaped "quotes"');
      assert.strictEqual(results[1].active, false);
      assert.strictEqual(results[1].price, 42);
      assert.strictEqual(results[1].tags, ""); // empty string preserved
    });

    it("rejects empty column header in CSV", async () => {
      const csv = "id,,name\n1,2,Alice\n";
      const file = new File([csv], "test.csv");
      await assert.rejects(async () => {
        for await (const _ of parseCsvStream(file)) {
          // no-op
        }
      }, /CSV contains empty column header/);
    });

    it("rejects duplicate column header in CSV", async () => {
      const csv = "id,name,id\n1,Alice,2\n";
      const file = new File([csv], "test.csv");
      await assert.rejects(async () => {
        for await (const _ of parseCsvStream(file)) {
          // no-op
        }
      }, /CSV contains duplicate column header: id/);
    });

    it("rejects prototype pollution in CSV headers", async () => {
      const csv = "id,__proto__.polluted\n1,evil\n";
      const file = new File([csv], "test.csv");
      await assert.rejects(async () => {
        for await (const _ of parseCsvStream(file)) {
          // no-op
        }
      }, /Prototype pollution attempt detected in CSV header/);
    });

    it("rejects path collision in dotted headers (nesting into scalar)", () => {
      const doc: MongoBulkDocument = {};
      setDottedPath(doc, "user", "Alice");
      assert.throws(
        () => setDottedPath(doc, "user.name", "Alice"),
        /Path collision in CSV headers: cannot nest into scalar at path 'user'/,
      );
    });

    it("coerces values accurately according to Stage 3 contract", () => {
      assert.strictEqual(coerceCsvValue(""), "");
      assert.strictEqual(coerceCsvValue("null"), null);
      assert.strictEqual(coerceCsvValue("NULL"), null);
      assert.strictEqual(coerceCsvValue("true"), true);
      assert.strictEqual(coerceCsvValue("FALSE"), false);
      assert.strictEqual(coerceCsvValue("12345"), 12345);
      assert.strictEqual(coerceCsvValue("-98.76"), -98.76);
      assert.deepStrictEqual(coerceCsvValue('{"a": 1}'), { a: 1 });
      assert.deepStrictEqual(coerceCsvValue("[1, 2, 3]"), [1, 2, 3]);
      assert.strictEqual(coerceCsvValue("unquoted text"), "unquoted text");
    });

    it("correctly parses escaped quotes split across slice boundaries", async () => {
      // 'id,desc\n' (8 bytes) + '1,"a"' (5 bytes) = 13 bytes
      // Next slice will start with '"b"\n'
      const csv = 'id,desc\n1,"a""b"\n';
      const file = new File([csv], "test.csv");
      const results: MongoBulkDocument[] = [];
      for await (const item of parseCsvStream(file, { sliceSize: 13 })) {
        results.push(item.doc);
      }
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, 1);
      assert.strictEqual(results[0].desc, 'a"b');
    });

    it("correctly parses closing quote followed by delimiter split across slice boundaries", async () => {
      // 'a,b\n' (4 bytes) + '"hello"' (7 bytes) = 11 bytes
      // Next slice will start with ',world\n'
      const csv = 'a,b\n"hello",world\n';
      const file = new File([csv], "test.csv");
      const results: MongoBulkDocument[] = [];
      for await (const item of parseCsvStream(file, { sliceSize: 11 })) {
        results.push(item.doc);
      }
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].a, "hello");
      assert.strictEqual(results[0].b, "world");
    });

    it("rejects closing quote followed by invalid characters across slice boundaries", async () => {
      // 'a,b\n' (4 bytes) + '"val"' (5 bytes) = 9 bytes
      // Next slice starts with 'abc,world\n'
      const csv = 'a,b\n"val"abc,world\n';
      const file = new File([csv], "test.csv");
      await assert.rejects(async () => {
        for await (const _ of parseCsvStream(file, { sliceSize: 9 })) {
          // no-op
        }
      }, /CSV syntax error: Unexpected character 'a' after closing quote/);
    });

    it("correctly parses CRLF sequence split across slice boundaries", async () => {
      // 'id,name\r' is 8 bytes. Slice 2 will start with '\n1,Alice\r\n'
      const csv = "id,name\r\n1,Alice\r\n";
      const file = new File([csv], "test.csv");
      const results: MongoBulkDocument[] = [];
      for await (const item of parseCsvStream(file, { sliceSize: 8 })) {
        results.push(item.doc);
      }
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, 1);
      assert.strictEqual(results[0].name, "Alice");
    });

    it("rejects unquoted field containing a quote (RFC 4180 violation)", async () => {
      const csv = 'id,name\n1,hel"lo\n';
      const file = new File([csv], "test.csv");
      await assert.rejects(async () => {
        for await (const _ of parseCsvStream(file)) {
          // no-op
        }
      }, /CSV syntax error: Unexpected quote at line 2, column 6\. Quotes inside unquoted fields are forbidden by RFC 4180\./);
    });

    it("rejects data row with extra fields (row-width mismatch)", async () => {
      const csv = "id,name,role\n1,Alice,admin,extra_column\n";
      const file = new File([csv], "test.csv");
      await assert.rejects(
        async () => {
          for await (const _ of parseCsvStream(file)) {
            // no-op
          }
        },
        (err: Error) => {
          assert.strictEqual(err.message, "CSV syntax error: Row 1 has 4 fields, expected 3");
          return true;
        },
      );
    });

    it("rejects data row with missing fields (row-width mismatch)", async () => {
      const csv = "id,name,role\n1,Alice\n";
      const file = new File([csv], "test.csv");
      await assert.rejects(
        async () => {
          for await (const _ of parseCsvStream(file)) {
            // no-op
          }
        },
        (err: Error) => {
          assert.strictEqual(err.message, "CSV syntax error: Row 1 has 2 fields, expected 3");
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 4. Zero-Document Import Pre-Rejection Invariants
  // =========================================================================
  describe("Zero-Document Rejection", () => {
    it("rejects 0-byte file immediately", async () => {
      const file = new File([], "empty.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, ZeroDocumentImportError);
    });

    it("rejects empty JSON array []", async () => {
      const file = new File(["   [ \n\t ]  "], "empty-array.json");
      await assert.rejects(async () => {
        for await (const _ of parseJsonArrayStream(file)) {
          // no-op
        }
      }, ZeroDocumentImportError);
    });

    it("rejects empty NDJSON file (only whitespace lines)", async () => {
      const file = new File(["  \n\r\n \t\n  "], "empty.ndjson");
      await assert.rejects(async () => {
        for await (const _ of parseNdjsonStream(file)) {
          // no-op
        }
      }, ZeroDocumentImportError);
    });

    it("rejects header-only CSV file (0 data rows)", async () => {
      const file = new File(["id,name,email\n"], "header-only.csv");
      await assert.rejects(async () => {
        for await (const _ of parseCsvStream(file)) {
          // no-op
        }
      }, ZeroDocumentImportError);
    });
  });

  // =========================================================================
  // 5. Chunk Generator Invariants & Sizing Rules
  // =========================================================================
  describe("Chunk Generator (createIncrementalChunkReader)", () => {
    it("chunks documents up to 1,000 docs and accurately sets isLastChunk", async () => {
      // Create 1,500 documents
      const docs: MongoBulkDocument[] = [];
      for (let i = 1; i <= 1500; i++) {
        docs.push({ index: i, text: `doc_${i}` });
      }

      const file = new File([JSON.stringify(docs)], "large.json");
      const chunks = [];
      for await (const chunk of createIncrementalChunkReader(file, "json")) {
        chunks.push(chunk);
      }

      assert.strictEqual(chunks.length, 2);

      // Chunk 0
      assert.strictEqual(chunks[0].chunkIndex, 0);
      assert.strictEqual(chunks[0].documentCount, 1000);
      assert.strictEqual(chunks[0].isLastChunk, false);
      assert.strictEqual(typeof chunks[0].payload, "string");

      // Chunk 1
      assert.strictEqual(chunks[1].chunkIndex, 1);
      assert.strictEqual(chunks[1].documentCount, 500);
      assert.strictEqual(chunks[1].isLastChunk, true);
    });

    it("re-injects CSV header row at the beginning of each CSV chunk", async () => {
      let csv = "id,name,val\n";
      for (let i = 1; i <= 1050; i++) {
        csv += `${i},Name${i},100\n`;
      }

      const file = new File([csv], "records.csv");
      const chunks = [];
      for await (const chunk of createIncrementalChunkReader(file, "csv")) {
        chunks.push(chunk);
      }

      assert.strictEqual(chunks.length, 2);

      // First chunk has header row
      assert.ok(chunks[0].payload.startsWith("id,name,val\n"));
      assert.strictEqual(chunks[0].documentCount, 1000);
      assert.strictEqual(chunks[0].isLastChunk, false);

      // Second chunk also has header row re-injected!
      assert.ok(chunks[1].payload.startsWith("id,name,val\n"));
      assert.strictEqual(chunks[1].documentCount, 50);
      assert.strictEqual(chunks[1].isLastChunk, true);
    });

    it("rejects single oversized document exceeding 4 MB", async () => {
      // 4.5 MB single document
      const largeString = "x".repeat(4.5 * 1024 * 1024);
      const docs = [{ id: 1, content: largeString }];
      const file = new File([JSON.stringify(docs)], "oversized.json");

      await assert.rejects(async () => {
        for await (const _ of createIncrementalChunkReader(file, "json")) {
          // no-op
        }
      }, ImportLimitExceededError);
    });

    it("supports AbortSignal to cancel reader mid-stream", async () => {
      const docs: MongoBulkDocument[] = [];
      for (let i = 1; i <= 2000; i++) {
        docs.push({ id: i, payload: "abc" });
      }
      const file = new File([JSON.stringify(docs)], "cancel.json");

      const controller = new AbortController();
      let chunksCount = 0;

      try {
        for await (const _chunk of createIncrementalChunkReader(file, "json", {
          signal: controller.signal,
        })) {
          chunksCount++;
          if (chunksCount === 1) {
            controller.abort();
          }
        }
        assert.fail("Should have aborted");
      } catch (err: unknown) {
        assert.strictEqual((err as Error).name, "AbortError");
      }
      assert.strictEqual(chunksCount, 1);
    });

    it("previewImportFile returns up to maxDocs non-blocking preview items", async () => {
      const docs = [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
        { id: 3, name: "C" },
        { id: 4, name: "D" },
        { id: 5, name: "E" },
        { id: 6, name: "F" },
      ];
      const file = new File([JSON.stringify(docs)], "preview.json");

      const preview = await previewImportFile(file, "json", 3);
      assert.strictEqual(preview.length, 3);
      assert.strictEqual(preview[0].name, "A");
      assert.strictEqual(preview[2].name, "C");
    });
  });
});
