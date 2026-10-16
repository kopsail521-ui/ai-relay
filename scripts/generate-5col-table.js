const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const live = JSON.parse(fs.readFileSync(path.join(root, 'tmp/live-pricing.json'), 'utf8')).data;
const ol = JSON.parse(fs.readFileSync(path.join(root, '_tmp_openlux_live.json'), 'utf8'));
const gitee = JSON.parse(fs.readFileSync(path.join(root, 'config/gitee-selected-models.json'), 'utf8'));
const unoPaid = JSON.parse(fs.readFileSync(path.join(root, 'config/unorouter-paid-models.json'), 'utf8'));
const apimart = JSON.parse(fs.readFileSync(path.join(root, 'config/apimart-selected-models.json'), 'utf8'));

const FX = 7.3;

const groupRatio = ol.group_ratio || {};
const olByName = Object.fromEntries((ol.data || []).map((m) => [m.model_name, m]));
const giteeMap = Object.fromEntries((gitee.models || []).map((m) => [m.id, m]));
const unoPaidMap = Object.fromEntries((unoPaid.models || []).map((m) => [m.id, m]));
const apimartSet = new Set((apimart.models || []).map((m) => m.id));

function minGroup(m) {
  const groups = m.enable_groups || [];
  let minG = null;
  for (const g of groups) {
    const r = groupRatio[g];
    if (r == null) continue;
    if (minG == null || r < minG) minG = r;
  }
  return minG;
}

function olCost(name) {
  const m = olByName[name];
  if (!m) return null;
  const minG = minGroup(m);
  if (minG == null) return null;
  if (m.quota_type === 1 || (m.model_price > 0 && !(m.model_ratio > 0))) {
    return { kind: 'call', costUsd: m.model_price * minG };
  }
  if (!(m.model_ratio > 0)) return null;
  const costIn = m.model_ratio * 2 * minG;
  return { kind: 'token', costIn, costOut: costIn * (m.completion_ratio || 1) };
}

const grsaiCostCny = {
  'gpt-image-2': 0.045,
  'gpt-image-2-vip': 0.15,
  'nano-banana-2': 0.08,
  'nano-banana-pro': 0.135,
  'nano-banana-2.1': 0.06,
  'gpt-image-2.5': 0.03,
  'gpt-image-2.5-flare': 0.1,
  'gpt-image-2.5-sunburst': 0.12,
};

// Zexapi models: sell = cost * 1.5, served in GPT-Image-HD group (ratio 13.140553)
const zexSpecs = {
  'gpt-image-2-2K': { sellUsd: 0.15, costUsd: 0.10, offCny: 0.0265 * FX },
  'gpt-image-2-4K': { sellUsd: 0.15, costUsd: 0.10, offCny: 0.0265 * FX },
  'gpt-image-2.5-flare-vip': { sellUsd: 0.27, costUsd: 0.18, offCny: 0.25 * FX },
  'gpt-image-2.5-sunburst-vip': { sellUsd: 0.375, costUsd: 0.25, offCny: 0.25 * FX },
};

const aicopyCostCny = {
  'keyo-super-resolution-1080p': 0.2,
  'keyo-super-resolution-2k': 0.4,
  'keyo-super-resolution-4k': 0.8,
  'keyo-video-subtitle-removal': 0.05,
  'grok-image-2.0': 0.01,
  'keyo-voice-clone': 0.05,
  'keyo-tts': 0.05,
  'keyo-song': 0.05,
  'keyo-asr': 0.05,
};

const officialTokenUsd = {
  'gpt-6.1-sol': [2, 10], 'gpt-6-sol': [2, 10], 'gpt-6-luna': [0.1, 0.5], 'gpt-6-astra': [10, 50],
  'gpt-5.6-terra': [2, 12], 'gpt-5.6-sol': [4, 20], 'gpt-5.6-luna': [0.2, 1.2],
  'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20], 'claude-fable-5-1': [10, 50],
  'claude-sonnet-5': [2, 10], 'claude-opus-5': [5, 25], 'claude-fable-5': [10, 50],
  'claude-haiku-5-5': [0.25, 1.25],
  'gemini-3.8-flash': [0.75, 3.75], 'gemini-3.7-flash': [0.75, 3.75],
  'deepseek-v4-pro-0813': [0.66, 1.98], 'deepseek-v4-flash-0731': [0.15, 0.6],
  'deepseek-v4.1-flash': [0.15, 0.6], 'deepseek-v4-pro': [0.66, 1.98], 'deepseek-v4-flash': [0.15, 0.6],
  'grok-4.7': [2, 6], 'grok-4.6': [2, 6], 'kimi-k3': [3, 15], 'kimi-k2.7-code': [0.19, 4],
  'minimax-m3': [0.3, 1.2], 'glm-5.3-flash': [0.15, 0.5], 'glm-5.3': [1.4, 4.4], 'glm-5.2': [1.4, 4.4],
};
const officialCnyToken = { 'qwen3.8-max-0902': [12, 36], 'qwen3.8-flash': [0.8, 2.7] };
const officialCallCny = {
  'gpt-image-2': 0.0265 * FX, 'gpt-image-2-vip': 0.105 * FX,
  'gpt-image-2.5': 0.25 * FX, 'gpt-image-2.5-flare': 0.25 * FX, 'gpt-image-2.5-sunburst': 0.25 * FX,
  'nano-banana-2': 0.067 * FX, 'nano-banana-pro': 0.134 * FX, 'nano-banana-2.1': 0.067 * FX,
};

const t = (n, d = 4) => (n == null || !Number.isFinite(+n) ? '-' : (+(+n).toFixed(d)).toString());
const mult = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
const fmtM = (m) => (m == null ? '-' : t(m, 2) + '×');
const fmtMP = (a, b) => {
  if (a == null && b == null) return '-';
  if (a == null) return fmtM(b);
  if (b == null) return fmtM(a);
  if (Math.abs(a - b) < 0.08) return fmtM((a + b) / 2);
  return '入' + fmtM(a) + '/出' + fmtM(b);
};

const table = [];
for (const m of live) {
  const name = m.model_name;
  const tokenMode = m.model_ratio > 0 && m.quota_type !== 1;
  const isFree = (m.model_price === 0 && !(m.model_ratio > 0)) || /:free$/i.test(name);

  if (isFree && !tokenMode) {
    const up = name.startsWith('keyo-flash') ? '云知声（免费池）' : 'Gitee 模力方舟';
    table.push([name, '免费（赠送金）', '上游免费', up, '-', '-', '-']);
    continue;
  }

  // Zexapi HD Image models
  if (zexSpecs[name]) {
    const spec = zexSpecs[name];
    const sCny = spec.sellUsd * FX;
    const cCny = spec.costUsd * FX;
    const oCny = spec.offCny;
    table.push([
      name,
      '¥' + t(sCny) + '/次 ($' + t(spec.sellUsd) + ')',
      '¥' + t(cCny) + '/次 ($' + t(spec.costUsd) + ')',
      'Zexapi',
      '¥' + t(oCny) + '/次',
      fmtM(mult(sCny, cCny)),
      fmtM(mult(sCny, oCny))
    ]);
    continue;
  }

  if (tokenMode) {
    const sellIn = m.model_ratio * 2;
    const sellOut = sellIn * (m.completion_ratio || 1);
    const g = giteeMap[name] || (name === 'keyo-text-moderation' ? giteeMap['moark-text-moderation'] : null);
    const uno = unoPaidMap[name];
    const olc = olCost(name);

    if (name === 'claude-haiku-5-5') {
      const cIn = 0.029412, cOut = 0.14706;
      table.push([
        name,
        '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
        '$' + t(cIn) + ' / $' + t(cOut) + ' /M',
        'OpenLux',
        '$0.25 / $1.25 /M',
        fmtMP(mult(sellIn, cIn), mult(sellOut, cOut)),
        fmtMP(mult(sellIn, 0.25), mult(sellOut, 1.25))
      ]);
      continue;
    }

    if (name === 'gemini-4-argon' || name === 'gemini-4-barium') {
      const cIn = sellIn / 5, cOut = sellOut / 5;
      table.push([
        name,
        '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
        '$' + t(cIn) + ' / $' + t(cOut) + ' /M',
        'OpenLux',
        '待核官方',
        '5×',
        '-'
      ]);
      continue;
    }

    if (name === 'gemini-3.8-flash-tts') {
      const cIn = 0.2206, cOut = 4.4120;
      table.push([
        name,
        '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
        '$' + t(cIn) + ' / $' + t(cOut) + ' /M',
        'OpenLux',
        '待核官方',
        '2×',
        '-'
      ]);
      continue;
    }

    if (name === 'eleven-v4' || name === 'eleven-v4-turbo') {
      const cIn = sellIn / 2, cOut = sellOut / 2;
      table.push([
        name,
        '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M字符',
        '$' + t(cIn) + ' / $' + t(cOut) + ' /M字符',
        'OpenRouter',
        '待核官方',
        '2×',
        '-'
      ]);
      continue;
    }

    if (name === 'cloudflare/clef') {
      const cIn = 0.0333, cOut = 0.0333;
      table.push([
        name,
        '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
        '$' + t(cIn) + ' / $' + t(cOut) + ' /M',
        'OpenRouter',
        '待核官方',
        '1.5×',
        '-'
      ]);
      continue;
    }

    if (name === 'DeepSeek-Prover-V2-7B' || name === 'Atria-dawn-v2') {
      const cIn = sellIn / 2, cOut = sellOut / 2;
      table.push([
        name,
        '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
        '$' + t(cIn) + ' / $' + t(cOut) + ' /M',
        'Gitee 模力方舟',
        '待核官方',
        '2×',
        '-'
      ]);
      continue;
    }

    if (name === 'Bespoke-Nimble-9B') {
      const cIn = 0.016, cOut = 0;
      table.push([
        name,
        '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
        '$' + t(cIn) + ' / $' + t(cOut) + ' /M',
        'Gitee 模力方舟',
        '待核官方',
        '2×',
        '-'
      ]);
      continue;
    }

    if (g && (g.billing?.cost_in_cny_per_m != null || g.billing?.cost_in_usd_per_m != null)) {
      const b = g.billing;
      if (b.cost_in_cny_per_m != null) {
        const cin = b.cost_in_cny_per_m;
        const cout = b.cost_out_cny_per_m ?? cin;
        const sIn = sellIn * FX;
        const sOut = sellOut * FX;
        table.push([
          name,
          '¥' + t(sIn) + ' / ¥' + t(sOut) + ' /M',
          '¥' + t(cin) + ' / ¥' + t(cout) + ' /M',
          'Gitee 模力方舟',
          '¥' + t(cin) + ' / ¥' + t(cout) + ' /M（Gitee）',
          fmtMP(mult(sIn, cin), mult(sOut, cout)),
          fmtMP(mult(sIn, cin), mult(sOut, cout))
        ]);
      } else {
        const cin = b.cost_in_usd_per_m;
        const cout = b.cost_out_usd_per_m ?? cin;
        table.push([
          name,
          '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
          '$' + t(cin) + ' / $' + t(cout) + ' /M',
          'Gitee 模力方舟',
          '$' + t(cin) + ' / $' + t(cout) + ' /M（Gitee）',
          fmtMP(mult(sellIn, cin), mult(sellOut, cout)),
          fmtMP(mult(sellIn, cin), mult(sellOut, cout))
        ]);
      }
      continue;
    }

    if (uno) {
      const cin = uno.cost_in;
      const cout = uno.cost_out;
      const off = officialTokenUsd[name];
      if (officialCnyToken[name]) {
        const [offInC, offOutC] = officialCnyToken[name];
        const sInC = sellIn * FX, sOutC = sellOut * FX;
        table.push([
          name,
          '¥' + t(sInC) + ' / ¥' + t(sOutC) + ' /M',
          '$' + t(cin) + ' / $' + t(cout) + ' /M',
          'UnoRouter',
          '¥' + t(offInC) + ' / ¥' + t(offOutC) + ' /M（阿里云百炼）',
          fmtMP(mult(sellIn, cin), mult(sellOut, cout)),
          fmtMP(mult(sInC, offInC), mult(sOutC, offOutC))
        ]);
      } else {
        table.push([
          name,
          '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
          '$' + t(cin) + ' / $' + t(cout) + ' /M',
          'UnoRouter',
          off ? '$' + t(off[0]) + ' / $' + t(off[1]) + ' /M' : '待核官方',
          fmtMP(mult(sellIn, cin), mult(sellOut, cout)),
          off ? fmtMP(mult(sellIn, off[0]), mult(sellOut, off[1])) : '-'
        ]);
      }
      continue;
    }

    if (officialCnyToken[name]) {
      const [offInC, offOutC] = officialCnyToken[name];
      const sInC = sellIn * FX, sOutC = sellOut * FX;
      const cin = olc?.costIn, cout = olc?.costOut;
      table.push([
        name,
        '¥' + t(sInC) + ' / ¥' + t(sOutC) + ' /M',
        cin != null ? '$' + t(cin) + ' / $' + t(cout) + ' /M' : '-',
        'OpenLux',
        '¥' + t(offInC) + ' / ¥' + t(offOutC) + ' /M（阿里云百炼）',
        fmtMP(mult(sellIn, cin), mult(sellOut, cout)),
        fmtMP(mult(sInC, offInC), mult(sOutC, offOutC))
      ]);
      continue;
    }

    const cin = olc?.costIn, cout = olc?.costOut;
    const off = officialTokenUsd[name];
    table.push([
      name,
      '$' + t(sellIn) + ' / $' + t(sellOut) + ' /M',
      cin != null ? '$' + t(cin) + ' / $' + t(cout) + ' /M' : '-',
      'OpenLux',
      off ? '$' + t(off[0]) + ' / $' + t(off[1]) + ' /M' : '待核官方',
      fmtMP(mult(sellIn, cin), mult(sellOut, cout)),
      off ? fmtMP(mult(sellIn, off[0]), mult(sellOut, off[1])) : '-'
    ]);
    continue;
  }

  // Per call
  const sellCny = m.model_price * FX;
  const g = giteeMap[name] || (name === 'keyo-text-moderation' ? giteeMap['moark-text-moderation'] : null);
  let unit = g?.billing?.unit_label || (name.includes('moderation') ? '字符' : '次');
  if (name.includes('Duix-Avatar') || name === 'agnes-video-2.5') unit = '秒';
  if (name.includes('MinerU')) unit = '页';
  if (name === 'Qwen3-TTS' || name === 'CosyVoice3' || name === 'IndexTTS-2') unit = '万字符';

  let costCny = null;
  let offLabel = '待核官方';
  let offCny = null;
  let upstream = 'OpenLux';

  if (aicopyCostCny[name] != null) {
    costCny = aicopyCostCny[name];
    upstream = 'aicopy';
  } else if (grsaiCostCny[name] != null) {
    costCny = grsaiCostCny[name];
    upstream = 'Grsai';
    if (officialCallCny[name] != null) {
      offCny = officialCallCny[name];
      offLabel = '¥' + t(offCny) + '/' + unit;
    }
  } else if (g?.billing?.cost_cny != null) {
    costCny = g.billing.cost_cny;
    offCny = g.billing.cost_cny;
    upstream = 'Gitee 模力方舟';
    offLabel = '¥' + t(offCny) + '/' + unit + '（Gitee）';
  } else if (apimartSet.has(name)) {
    costCny = sellCny / 1.2;
    upstream = 'APIMart';
    if (name.includes('seedance')) offLabel = '火山≈¥1/秒（按次难直比）';
    else if (name.includes('MiniMax-H3')) offLabel = 'MiniMax $0.08/秒（按次难直比）';
  } else if (name === 'video-enhance-pro' || name === 'subtitle-erase-pro') {
    costCny = sellCny / 2;
    upstream = '火山引擎（本地代理）';
  } else if (name === 'suno_music_open') {
    costCny = 0.00196083 * FX;
    upstream = 'OpenLux';
  } else if (name === 'grok-video-1.5') {
    costCny = sellCny / 2;
    upstream = 'OpenLux';
    offLabel = 'xAI $0.05/秒（按次难直比）';
  } else if (name === 'SenseVoiceSmall') {
    costCny = 0.01;
    upstream = 'Gitee 模力方舟';
    offLabel = '¥0.01/次（Gitee）';
  } else if (name === 'Spark-TTS-0.5B') {
    costCny = 0.02;
    upstream = 'Gitee 模力方舟';
    offLabel = '待核官方';
  }

  table.push([
    name,
    '¥' + t(sellCny) + '/' + unit,
    costCny != null ? '¥' + t(costCny) + '/' + unit : '-',
    upstream,
    offLabel,
    fmtM(mult(sellCny, costCny)),
    offCny != null ? fmtM(mult(sellCny, offCny)) : '-'
  ]);
}

const header = [
  '| 模型 | 我的售价 | 我的成本 | 上游供应商 | 官方售价 | 售价是成本的多少倍 | 售价是官方售价的多少倍 |',
  '|---|---|---|---|---|---|---|'
];
const lines = header.concat(table.map(r => '| ' + r.join(' | ') + ' |'));
fs.writeFileSync(path.join(root, '_tmp_price_5col.md'), lines.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(root, '_tmp_price_upstream.md'), lines.join('\n') + '\n', 'utf8');
console.log('Successfully written', table.length, 'models with upstream column to _tmp_price_5col.md & _tmp_price_upstream.md');
