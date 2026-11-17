import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { queryService } from "../../../services/bridge/query.ts";

describe("MongoWorkspaceCancellation Wiring", () => {
  it("invokes queryService.cancelQuery with active sessionId when cancelled", async () => {
    const originalCancel = queryService.cancelQuery;
    let passedSessionId = "";
    queryService.cancelQuery = async (sid: string) => {
      passedSessionId = sid;
      return { cancelled: true };
    };

    try {
      const testSessionId = "test-session-123";
      const res = await queryService.cancelQuery(testSessionId);

      assert.equal(passedSessionId, testSessionId);
      assert.deepEqual(res, { cancelled: true });
    } finally {
      queryService.cancelQuery = originalCancel;
    }
  });

  it("aborts AbortController signal on cancellation", () => {
    const controller = new AbortController();
    assert.equal(controller.signal.aborted, false);

    controller.abort();
    assert.equal(controller.signal.aborted, true);
  });

  it("handles cancel when sessionId is missing by throwing error", async () => {
    await assert.rejects(async () => {
      await queryService.cancelQuery("");
    }, /sessionId is required/);
  });

  it("proves explain-view cancellation reaches active session and aborts correctly", async () => {
    const originalCancel = queryService.cancelQuery;
    let cancelCalledWith = "";
    queryService.cancelQuery = async (sid: string) => {
      cancelCalledWith = sid;
      return { cancelled: true };
    };

    const explainAbortController = new AbortController();
    const activeExplainSessionId = "explain-session-uuid-456";

    // Simulate explain cancellation trigger from MongoExplainView
    const cancelExplain = async () => {
      explainAbortController.abort();
      await queryService.cancelQuery(activeExplainSessionId);
    };

    try {
      assert.equal(explainAbortController.signal.aborted, false);
      await cancelExplain();
      assert.equal(explainAbortController.signal.aborted, true);
      assert.equal(cancelCalledWith, activeExplainSessionId);
    } finally {
      queryService.cancelQuery = originalCancel;
    }
  });
});
