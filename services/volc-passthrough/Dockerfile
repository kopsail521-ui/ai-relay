FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
ENV NODE_ENV=production
ENV PORT=3012
ENV LISTEN_HOST=0.0.0.0
EXPOSE 3012
CMD ["node", "server.mjs"]
