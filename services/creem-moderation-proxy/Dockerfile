FROM node:22-alpine
WORKDIR /app
COPY video-routing.mjs server.mjs marketplace-model-copy.json model-icon-map.json billing-unit-inject.js ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server.mjs"]
