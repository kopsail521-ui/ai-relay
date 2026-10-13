// Push local main to GitHub via REST git-data API (fallback when github.com:443 is blocked).
// Usage: KEYO_GH_TOKEN=... node tmp/_api_push.mjs
import { execSync } from 'node:child_process';

const OWNER = 'kopsail521-ui';
const REPO = 'ai-relay';
const TOKEN = process.env.KEYO_GH_TOKEN;
if (!TOKEN) {
  console.error('NO_TOKEN');
  process.exit(1);
}
const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, _retry = 0) {
  const res = await fetch(BASE + path, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'keyo-sync',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    if (_retry < 5) {
      await sleep(2000 * (_retry + 1));
      return api(method, path, body, _retry + 1);
    }
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const sh = (cmd) => execSync(cmd, { maxBuffer: 64 * 1024 * 1024 }).toString().trim();

async function ensureBlob(sha) {
  try {
    await api('GET', `/git/blobs/${sha}`);
    return sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const content = execSync(`git cat-file blob ${sha}`, { maxBuffer: 256 * 1024 * 1024 });
  const created = await api('POST', '/git/blobs', {
    content: content.toString('base64'),
    encoding: 'base64',
  });
  return created.sha;
}

async function ensureTree(sha) {
  try {
    await api('GET', `/git/trees/${sha}`);
    return sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const listing = execSync(`git ls-tree -z ${sha}`, { maxBuffer: 64 * 1024 * 1024 });
  const entries = [];
  for (const raw of listing.toString().split('\0')) {
    if (!raw) continue;
    const tab = raw.indexOf('\t');
    const meta = raw.slice(0, tab).split(/\s+/);
    const name = raw.slice(tab + 1);
    const mode = meta[0];
    const type = meta[1];
    const itemSha = meta[2];
    if (type === 'commit') continue; // gitlink, not needed
    const resolvedSha = type === 'tree' ? await ensureTree(itemSha) : await ensureBlob(itemSha);
    entries.push({ path: name, mode, type, sha: resolvedSha });
  }
  const created = await api('POST', '/git/trees', { tree: entries });
  return created.sha;
}

function parseCommitRaw(raw) {
  const lines = raw.split('\n');
  const headers = [];
  let i = 0;
  for (; i < lines.length; i++) {
    if (lines[i] === '') break;
    headers.push(lines[i]);
  }
  const message = lines.slice(i + 1).join('\n').replace(/\n$/, '');
  const tree = headers.find((l) => l.startsWith('tree ')).slice(5);
  const parents = headers.filter((l) => l.startsWith('parent ')).map((l) => l.slice(7));
  const authorLine = headers.find((l) => l.startsWith('author '));
  const committerLine = headers.find((l) => l.startsWith('committer '));
  const parsePerson = (line) => {
    const m = line.match(/^(.*?) <(.*?)> (\d+) ([+-]\d{4})$/);
    return {
      name: m[1],
      email: m[2],
      date: new Date(parseInt(m[3], 10) * 1000).toISOString(),
    };
  };
  return { tree, parents, message, author: parsePerson(authorLine), committer: parsePerson(committerLine) };
}

async function main() {
  const head = sh('git rev-parse HEAD');
  const all = sh(`git rev-list --reverse HEAD`).split('\n').filter(Boolean);

  let remoteSha = null;
  try {
    const ref = await api('GET', '/git/ref/heads/main');
    remoteSha = ref.object.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  let start = 0;
  if (remoteSha) {
    const idx = all.indexOf(remoteSha);
    if (idx === -1) {
      console.log('DIVERGED_REMOTE', remoteSha.slice(0, 7));
      process.exit(2);
    }
    start = idx + 1;
  }
  const toPush = all.slice(start);
  if (toPush.length === 0) {
    console.log('NOTHING_TO_PUSH');
    process.exit(0);
  }

  let parentSha = remoteSha;
  let lastSha = null;
  for (const c of toPush) {
    const raw = sh(`git cat-file commit ${c}`);
    const { tree, message, author, committer } = parseCommitRaw(raw);
    const treeSha = await ensureTree(tree);
    const parents = parentSha ? [parentSha] : [];
    const created = await api('POST', '/git/commits', {
      message,
      tree: treeSha,
      parents,
      author,
      committer,
    });
    lastSha = created.sha;
    parentSha = created.sha;
    console.log('pushed', c.slice(0, 7), '->', created.sha.slice(0, 7));
  }

  await api('PATCH', '/git/refs/heads/main', { sha: lastSha, force: false });
  console.log('API_PUSH_OK', lastSha.slice(0, 7));
}

main().catch((e) => {
  console.error('API_PUSH_ERR', e.message);
  process.exit(1);
});