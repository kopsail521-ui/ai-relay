/**
 * Offline tests for async task response normalization — NO network, NO billing.
 * Usage: node scripts/test-task-responses-offline.mjs
 */
import assert from "assert/strict";
import { extractTaskId, normalizeVideoPoll, taskStatus, canTryNextVideoModel } from "../services/apimart-passthrough/task-responses.mjs";

assert.equal(taskStatus("running"), "processing");
assert.equal(taskStatus("succeeded"), "completed");
assert.equal(taskStatus("error"), "failed");
assert.equal(taskStatus("cancelled"), "cancelled");
assert.equal(extractTaskId('{"data":[{"task_id":"t_1"}]}'), "t_1");
assert.equal(extractTaskId('{"task":{"id":"task_ol_1"}}'), "task_ol_1");
assert.equal(extractTaskId('{"base_resp":{"status_code":0},"task_id":"task_ol_2"}'), "task_ol_2");
for (const status of [400, 404, 422]) {
  for (const code of ['model_not_found', 'unknown_model', 'invalid_model', 'model_not_available']) {
    assert.equal(canTryNextVideoModel(status, { error: { code } }), true);
    assert.equal(canTryNextVideoModel(status, { error: { code }, task_id: 'already-created' }), false);
  }
}
for (const status of [200, 202, 401, 403, 429, 500, 502, 503, 504]) {
  assert.equal(canTryNextVideoModel(status, { error: { code: 'model_not_available' } }), false);
}
assert.equal(canTryNextVideoModel(400, { error: { code: 'invalid_parameter' } }), false);
assert.equal(canTryNextVideoModel(404, 'not found'), false);

const normalized = JSON.parse(normalizeVideoPoll(
  JSON.stringify({ status: "succeeded", data: { result: { videos: [{ url: ["https://cdn.example/out.mp4"] }] } } }),
  "t_1",
));
assert.equal(normalized.status, "completed");
assert.equal(normalized.id, "t_1");
assert.equal(normalized.data.task_id, "t_1");
assert.equal(normalized.url, "https://cdn.example/out.mp4");

// OpenLux MiniMax running state
const openluxRunning = JSON.parse(normalizeVideoPoll(
  JSON.stringify({ task_id: "task_ol_1", base_resp: { status_msg: "success", status_code: 0 } }),
  "task_ol_1"
));
assert.equal(openluxRunning.status, "processing");
assert.equal(openluxRunning.id, "task_ol_1");
assert.equal(openluxRunning.data.status, "processing");

// OpenLux MiniMax completed state
const openluxCompleted = JSON.parse(normalizeVideoPoll(
  JSON.stringify({
    task: { id: "task_ol_1", status: "succeeded", content: { url: "https://files.metaso.cn/video.mp4" } },
    base_resp: { status_msg: "success", status_code: 0 }
  }),
  "task_ol_1"
));
assert.equal(openluxCompleted.status, "completed");
assert.equal(openluxCompleted.id, "task_ol_1");
assert.equal(openluxCompleted.url, "https://files.metaso.cn/video.mp4");
assert.equal(openluxCompleted.data.result.videos[0].url[0], "https://files.metaso.cn/video.mp4");

const errorBody = JSON.stringify({ code: 404, message: "task not found" });
assert.equal(normalizeVideoPoll(errorBody, "t_1", 404), errorBody);

console.log("All offline task response tests passed");
