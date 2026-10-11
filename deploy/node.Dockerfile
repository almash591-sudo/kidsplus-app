# Образ для Node-сервисов (api, worker). Сервис выбирается build-аргументом APP.
# На Railway APP задаётся переменной сервиса — Railway передаёт её как build-arg.

# Образы — через зеркало Google: Docker Hub отвечает сборщику Railway 429 (лимит запросов).
FROM mirror.gcr.io/library/node:24-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
ARG APP
COPY . .
RUN pnpm install --frozen-lockfile --filter "@kidsplus/${APP}..."
RUN pnpm --filter "@kidsplus/${APP}" build
# Только runtime-зависимости; workspace-пакеты уже вшиты в бандл.
RUN pnpm --filter "@kidsplus/${APP}" deploy --prod /out

FROM mirror.gcr.io/library/node:24-alpine
ARG APP
ENV NODE_ENV=production
# worker делает резервные копии базы: pg_dump той же версии, что сервер (PostgreSQL 18 на Railway).
RUN if [ "$APP" = "worker" ]; then apk add --no-cache postgresql18-client; fi
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/${APP}/dist ./dist
# SQL-миграции: dist/migrate.js ищет их в ../drizzle (нужны только api).
COPY --from=build /repo/packages/db/drizzle ./drizzle
USER node
CMD ["node", "--enable-source-maps", "dist/index.js"]
