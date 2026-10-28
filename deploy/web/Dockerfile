# Веб-сервис PWA: сборка Vite + Caddy. Приложение выбирается build-аргументом APP (kid | parent).

# Образы — через зеркало Google: Docker Hub отвечает сборщику Railway 429 (лимит запросов).
FROM mirror.gcr.io/library/node:24-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
ARG APP
COPY . .
RUN pnpm install --frozen-lockfile --filter "@kidsplus/${APP}..."
# Коммит — в отчётах о сбоях детского приложения (этап 51); Railway передаёт его сам.
ARG RAILWAY_GIT_COMMIT_SHA
RUN pnpm --filter "@kidsplus/${APP}" build

FROM mirror.gcr.io/library/caddy:2-alpine
ARG APP
ENV APP=${APP}
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/${APP}/dist /srv
# Лендинг (этап 24): статический сайт без сборки — /start и /guide на домене кабинета.
COPY apps/landing /srv-landing
