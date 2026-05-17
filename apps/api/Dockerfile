FROM node:20-alpine AS base
WORKDIR /app

# Native module build deps（better-sqlite3 / bcrypt 等需 node-gyp + python + gcc；
# 缺一即 npm install 失敗。保留至 dev stage；prod stage 從 build artifacts 重組可不帶。）
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package.json ./
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
