/** Pure response handling; never turn a transport/business error into a running task. */
export function taskStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (['success', 'succeeded', 'completed', 'done'].includes(s)) return 'completed';
  if (['failure', 'failed', 'error', 'violation'].includes(s)) return 'failed';
  if (['canceled', 'cancelled'].includes(s)) return 'cancelled';
  if (['queued', 'pending', 'submitted', 'waiting', 'running', 'in_progress', 'processing'].includes(s)) return 'processing';
  return s;
}

export function extractTaskId(payload) {
  try {
    const j = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const d = Array.isArray(j?.data) ? j.data[0] : j?.data;
    const id = j?.task_id || j?.id || d?.task_id || d?.id;
    return typeof id === 'string' && id.trim() ? id : '';
  } catch { return ''; }
}

export function normalizeVideoPoll(raw, id, httpStatus = 200) {
  let j;
  try { j = JSON.parse(raw); } catch { return raw; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return raw;
  const d = j.data && typeof j.data === 'object' && !Array.isArray(j.data) ? { ...j.data } : {};
  const rawStatus = d.status || j.status;
  const status = taskStatus(rawStatus);
  const businessError = j.success === false || (Number(j.code) >= 400);
  if (httpStatus >= 400 || businessError || (j.error && !['failed', 'cancelled'].includes(status))) return raw;
  // An empty object or a missing-status error is not evidence of a running task.
  if (!status) return raw;
  const videos = d.result?.videos || j.result?.videos;
  const candidate = j.url || j.video_url || d.url || d.video_url || j.results?.[0]?.url || d.results?.[0]?.url || videos?.[0]?.url;
  const url = Array.isArray(candidate) ? candidate[0] : candidate;
  d.id = id; d.task_id = id; d.status = status;
  if (rawStatus !== status) d.status_raw = rawStatus;
  if (j.progress != null && d.progress == null) d.progress = j.progress;
  if (status === 'completed' && d.progress == null) d.progress = 100;
  if (typeof url === 'string' && url) {
    j.url = url;
    d.result = { ...d.result, videos: [{ url: [url] }] };
  }
  return JSON.stringify({ ...j, id, task_id: id, status, data: d });
}
