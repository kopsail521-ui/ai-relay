FROM node:20-alpine
WORKDIR /app
# better-sqlite3（转化漏斗读 new-api SQLite）在 alpine 上需要本地编译
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3100
ENV DATA_DIR=/app/data
EXPOSE 3100
CMD ["node", "server.js"]
