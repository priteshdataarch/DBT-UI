# Build from repository root (folder that contains dbt_project.yml and this Dockerfile path).
# Example:
#   docker build -f dbt-ui/Dockerfile -t dbt-ui:latest .

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    python3-pip \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir --break-system-packages dbt-athena-community

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /dbt
COPY . .

WORKDIR /dbt/dbt-ui

ENV DBT_PROJECT_ROOT=/dbt
# Do not set NODE_ENV=production before install — pnpm would skip devDependencies and
# the prisma CLI (devDependency) would be missing for generate/build/runtime db push.
# next build requires AUTH_SECRET in production — overridden at runtime via compose / `-e`
ENV AUTH_SECRET=build-placeholder-change-at-runtime

RUN pnpm install --frozen-lockfile \
    && pnpm exec prisma generate \
    && pnpm run build

ENV NODE_ENV=production

EXPOSE 3001

ENV HOSTNAME=0.0.0.0

# SQLite schema + Next.js production server (listen on all interfaces for Docker)
CMD ["sh", "-c", "pnpm exec prisma db push && exec pnpm exec next start --hostname 0.0.0.0 --port 3001"]
