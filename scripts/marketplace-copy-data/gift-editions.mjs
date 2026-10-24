import audio from './audio.mjs';

const speechGiftEditions = Object.fromEntries(['SenseVoiceSmall', 'GLM-ASR', 'Spark-TTS-0.5B'].map(name => [
  `${name}:free`,
  {
    ...audio[name],
    fam: `${audio[name].fam}（赠送金版）`,
    famEn: `${audio[name].famEn} (gift-credit edition)`,
    feat: '按模型费率计费，优先扣减赠送金，不足时使用充值余额，实际价格见分组价格表',
    featEn: 'billed at the model rate using gift credits first, then recharge balance; see the group price table for current rates',
  },
]));

// Keep gift-credit aliases under the same no-price-in-description rule as the
// rest of the catalog. :free selects gift-credit billing, not a zero rate.
export default {
  ...speechGiftEditions,
  "glm-5.3:free": {
    unit: "token", fam: "智谱 GLM 5.3 赠送金模型", famEn: "Zhipu GLM 5.3 gift-credit edition",
    feat: "按模型费率计费，优先扣减赠送金，不足时使用充值余额，实际价格见分组价格表",
    featEn: "billed at the model rate using gift credits first, then recharge balance; see the group price table for current rates",
    mod: "文本", modEn: "text", usage: "对话、推理与编程", usageEn: "chat, reasoning and coding",
  },
  "deepseek-v4.1-flash-1017:free": {
    unit: "token", fam: "DeepSeek V4.1 Flash 1017 赠送金模型", famEn: "DeepSeek V4.1 Flash 1017 gift-credit edition",
    feat: "按模型费率计费，优先扣减赠送金，不足时使用充值余额，实际价格见分组价格表",
    featEn: "billed at the model rate using gift credits first, then recharge balance; see the group price table for current rates",
    mod: "文本与图像", modEn: "text and image", usage: "对话与视觉理解", usageEn: "chat and visual understanding",
  },
};
