/** Match the main gateway's actual task-not-found response (HTTP 400). */
export function looksLikeMissingVideo(status, buf) {
  // The primary gateway may report an unknown task as 401/403 with an
  // "invalid token" message. Treat those responses as route misses so the
  // compatibility fallback can try the task service before exposing an error.
  if ([401, 403, 404, 405].includes(status)) return true;
  let j;
  try { j = JSON.parse(buf.toString('utf8')); } catch { return false; }
  const code = String(j.code || j.error?.code || '').toLowerCase();
  const message = String(j.error?.message || j.message || '').toLowerCase();
  return code === 'task_not_exist' || message === 'task_not_exist' ||
    /invalid url|invalid token|invalid api token|authentication|not found|no route|does not exist/.test(message);
}
