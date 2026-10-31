FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production \
    PORT=3300 \
    HOST=0.0.0.0

EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3300/health || exit 1

# 凭证/设备文件写入容器内 /app/*.json; 持久化请挂载卷:
#   docker run -p 3300:3300 -v qqmusic-cred:/data ...
CMD ["node", "src/server.ts"]
