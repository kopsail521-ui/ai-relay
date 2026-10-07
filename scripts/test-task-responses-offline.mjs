/**
 * Offline tests for async task response normalization — NO network, NO billing.
 * Usage: node scripts/test-task-responses-offline.mjs
 */
import assert from "assert/strict";
import { extractTaskId, normalizeVideoPoll, taskStatus } from "../services/apimart-passthrough/task-responses.mjs";

assert.equal(taskStatus("running"), "processing");
assert.equal(taskStatus("succeeded"), "completed");
assert.equal(taskStatus("error"), "failed");
assert.equal(taskStatus("cancelled"), "cancelled");
assert.equal(extractTaskId('{"data":[{"task_id":"t_1"}]}'), "t_1");

const normalized = JSON.parse(normalizeVideoPoll(
  JSON.stringify({ status: "succeeded", data: { result: { videos: [{ url: ["https://cdn.example/out.mp4"] }] } } }),
  "t_1",
));
assert.equal(normalized.status, "completed");
assert.equal(normalized.id, "t_1");
assert.equal(normalized.data.task_id, "t_1");
assert.equal(normalized.url, "https://cdn.example/out.mp4");

const errorBody = JSON.stringify({ code: 404, message: "task not found" });
assert.equal(normalizeVideoPoll(errorBody, "t_1", 404), errorBody);

console.log("5 offline task response tests passed");
