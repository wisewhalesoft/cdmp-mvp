FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source
COPY . .

# Development stage
FROM base AS dev
EXPOSE 5173
CMD ["npx", "vite", "--host"]

# Build stage
FROM base AS build
RUN npm run build

# Production stage — serve with nginx
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
