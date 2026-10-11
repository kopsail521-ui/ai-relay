# 新增标签「视频处理」并迁移 4 个模型

- models.tags：keyo-super-resolution-1080p / -2k / -4k、keyo-video-subtitle-removal
  -> 视频处理（其余模型不动，视频模型标签保留 12 个）
- 两份 marketplace-model-copy.json：__tags__ 补 视频处理 7 语言条目
  （moderation-proxy 的 normalizeTagToken 已有 视频处理/VideoProc 映射，runbook
  仍会 docker cp server.mjs 保持容器与仓库一致）

粘贴：scripts/vps-tag-video-processing-short.txt（一整行）
期望：
  retag ... rows 1 ×4
  tags_i18n_merged ... ×2
  DONE_TAG_VIDEO_PROCESSING
  pricing=200
  4 行 tags 视频处理
  tag_video_processing 4
  public_leak False
  ALL_OK
  DONE_TAG_VIDEO_PROCESSING
