FROM node:20-alpine AS base
WORKDIR /app

# 本機 TLS 攔截修補：Kaspersky 端點防護（或企業 MITM proxy）以自簽 CA 重簽 HTTPS，
# 容器內 apk 會 "server certificate not trusted"、npm 會 SELF_SIGNED_CERT_IN_CHAIN。
# 各機器自行把該 root CA 放成 local-ca.crt（gitignored，見 README）；沒放的機器照常 build。
# 註：node:20-alpine 不含 update-ca-certificates，且 apk 本身就是壞掉的那個，故直接併入 bundle。
COPY package.json local-ca.cr[t] ./
RUN if [ -f local-ca.crt ]; then cat local-ca.crt >> /etc/ssl/certs/ca-certificates.crt; fi
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Native module build deps（better-sqlite3 / bcrypt 等需 node-gyp + python + gcc；
# 缺一即 npm install 失敗。保留至 dev stage；prod stage 從 build artifacts 重組可不帶。）
RUN apk add --no-cache python3 make g++

# Install dependencies（package.json 已於上方 CA 區塊一併 COPY）
RUN npm install

# Copy source
COPY . .

# Development stage
FROM base AS dev
EXPOSE 3000
CMD ["npx", "nest", "start", "--watch"]

# Build stage
FROM base AS build
RUN npm run build

# Production stage
FROM node:20-alpine AS prod
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
CMD ["node", "dist/main"]
