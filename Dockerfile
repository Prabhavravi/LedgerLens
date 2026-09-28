FROM node:20-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG BACKEND_PUBLIC_URL=http://127.0.0.1:8000/api/v1
ENV BACKEND_PUBLIC_URL=$BACKEND_PUBLIC_URL
RUN pnpm build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["pnpm", "start"]
