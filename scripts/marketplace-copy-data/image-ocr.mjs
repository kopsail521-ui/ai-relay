export default {
  "sam3": {
    unit: "request", per: "0.013699",
    fam: "Meta SAM 3 图像分割模型",
    famEn: "Meta's SAM 3 image segmentation model",
    feat: "开放词汇分割，可对任意目标生成像素级掩码",
    featEn: "open-vocabulary segmentation producing pixel-level masks for arbitrary objects",
    mod: "图像", modEn: "image",
    usage: "图像编辑、目标抠图、医学影像分析",
    usageEn: "image editing, object extraction, medical imaging"
  },
  "RMBG-2.0": {
    unit: "request", per: "0.006849",
    fam: "腾讯 RMBG 2.0 背景移除模型",
    famEn: "Tencent's RMBG 2.0 background removal model",
    feat: "高精度抠图，一键去除图像背景",
    featEn: "high-precision background removal in one step",
    mod: "图像", modEn: "image",
    usage: "电商图片处理、人像抠图、设计素材",
    usageEn: "e-commerce image processing, portrait cutout, design assets"
  },
  "Real-ESRGAN": {
    unit: "request", per: "0.006849",
    fam: "Real-ESRGAN 图像超分辨率模型",
    famEn: "Real-ESRGAN image super-resolution model",
    feat: "将低分辨率图像放大并恢复细节，适合老照片修复",
    featEn: "upscales low-resolution images with detail recovery for old photo restoration",
    mod: "图像", modEn: "image",
    usage: "老照片修复、图像放大、画质增强",
    usageEn: "old photo restoration, image upscaling, quality enhancement"
  },
  "VajraV1": {
    unit: "request", per: "0.006849",
    fam: "VajraV1 实时视觉模型",
    famEn: "VajraV1 real-time vision model",
    feat: "基于 YOLO 架构，支持目标检测、分割与关键点",
    featEn: "YOLO-based detection, segmentation, and keypoint estimation",
    mod: "图像", modEn: "image",
    usage: "监控分析、工业质检、零售视觉",
    usageEn: "surveillance analytics, industrial inspection, retail vision"
  },
  "UVDoc": {
    unit: "request", per: "0.013699",
    fam: "UVDoc 文档图像处理模型",
    famEn: "UVDoc document image processing model",
    feat: "矫正文档拍照畸变，去阴影、去摩尔纹，提升可读性",
    featEn: "corrects perspective distortion, shadows, and moiré for cleaner document scans",
    mod: "图像", modEn: "image",
    usage: "文档扫描、纸质资料数字化、拍摄文档增强",
    usageEn: "document scanning, paper digitization, photo-based document enhancement"
  },
  "AnimeSharp": {
    unit: "request", per: "0.006849",
    fam: "AnimeSharp 动漫图像增强模型",
    famEn: "AnimeSharp anime image enhancement model",
    feat: "针对动漫插画优化的超分辨率与画质增强",
    featEn: "super-resolution and enhancement optimized for anime illustrations",
    mod: "图像", modEn: "image",
    usage: "动漫图片修复、插画放大、画质提升",
    usageEn: "anime restoration, illustration upscaling, quality improvement"
  },
  "Unlimited-OCR": {
    unit: "token", in: "1.917808", out: "1.917808",
    fam: "Unlimited-OCR 通用文字识别模型",
    famEn: "Unlimited-OCR general-purpose optical character recognition",
    feat: "高精度识别图片与文档中的文字，支持多种语言与版面",
    featEn: "accurate text extraction from images and documents with multilingual and layout support",
    mod: "图像与文本", modEn: "image and text",
    usage: "票据识别、证件 OCR、文档数字化",
    usageEn: "receipt recognition, ID OCR, document digitization"
  },
  "MinerU2.5-Pro": {
    unit: "page", per: "0.013699",
    fam: "MinerU 2.5 Pro 文档解析模型",
    famEn: "MinerU 2.5 Pro document parsing model",
    feat: "将 PDF 解析为结构化 Markdown，保留公式、表格与版式",
    featEn: "converts PDFs to structured Markdown while preserving formulas, tables, and layout",
    mod: "文档", modEn: "documents",
    usage: "学术论文解析、文档转换、知识库构建",
    usageEn: "academic paper parsing, document conversion, knowledge base building"
  },
  "WeMM-Embedding-9B": {
    unit: "token", in: "0.616438", out: "0.616438",
    fam: "WeMM Embedding 9B 文本嵌入模型",
    famEn: "WeMM Embedding 9B text embedding model",
    feat: "生成高质量语义向量，适合大规模检索场景",
    featEn: "high-quality semantic vectors for large-scale retrieval",
    mod: "文本", modEn: "text",
    usage: "语义搜索、RAG、去重与聚类",
    usageEn: "semantic search, RAG, deduplication, clustering"
  },
  "WeMM-Embedding-4B": {
    unit: "token", in: "0.547946", out: "0.547946",
    fam: "WeMM Embedding 4B 文本嵌入模型",
    famEn: "WeMM Embedding 4B text embedding model",
    feat: "兼顾效果与成本的嵌入向量生成",
    featEn: "cost-effective embedding generation without compromising quality",
    mod: "文本", modEn: "text",
    usage: "向量检索、相似度匹配、推荐系统",
    usageEn: "vector search, similarity matching, recommendation systems"
  },
  "WeMM-Embedding-2B": {
    unit: "token", in: "0.479452", out: "0.479452",
    fam: "WeMM Embedding 2B 轻量文本嵌入模型",
    famEn: "WeMM Embedding 2B lightweight text embedding model",
    feat: "低资源消耗的嵌入模型，适合高吞吐场景",
    featEn: "low-resource embeddings for high-throughput scenarios",
    mod: "文本", modEn: "text",
    usage: "大规模向量化、实时检索、文本分类",
    usageEn: "large-scale vectorization, real-time retrieval, text classification"
  },
  "Qwen3-VL-Reranker-2B": {
    unit: "token", in: "0.0616", out: "0.0616",
    fam: "Qwen3-VL Reranker 2B 视觉重排序模型",
    famEn: "Qwen3-VL Reranker 2B multimodal reranking model",
    feat: "对检索结果进行精准重排，支持文本与图像相关性判断",
    featEn: "precise reranking of retrieval results with text and image relevance",
    mod: "文本与图像", modEn: "text and image",
    usage: "检索增强生成、多模态搜索排序",
    usageEn: "RAG, multimodal search ranking"
  },
  "Qwen3-VL-Reranker-8B": {
    unit: "token", in: "0.2397", out: "0.2397",
    fam: "Qwen3-VL Reranker 8B 视觉重排序模型",
    famEn: "Qwen3-VL Reranker 8B multimodal reranking model",
    feat: "更大参数量带来更强的相关性判断能力",
    featEn: "stronger relevance judgment at larger scale",
    mod: "文本与图像", modEn: "text and image",
    usage: "高精度检索排序、复杂查询重排",
    usageEn: "high-precision retrieval ranking, complex query reranking"
  }
};