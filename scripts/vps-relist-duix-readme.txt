# 重新上架 Duix-Avatar（成本×5，分辨率×时长分档）

粘贴：scripts/vps-relist-duix-short.txt（一整行）
期望：
  listed True · price 0.06849 · tags 数字人
  table_720 True · table_1080 True · bill_marker True
  public_leak False · DONE_RELIST_DUIX
硬开 /pricing 详情看「分组价格」四档（分辨率 × 时长）。调用必须 multipart 上传 ref_audio + ref_video。
透传容器须保持挂载：-v /opt/ai-relay/data/new-api:/data:rw 且 NEW_API_DB=/data/one-api.db。
