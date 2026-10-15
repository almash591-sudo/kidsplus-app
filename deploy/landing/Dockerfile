# Лендинг: Caddy и статические файлы, без сборки.
# Образ — через зеркало Google: Docker Hub отвечает сборщику Railway 429 (лимит запросов).
FROM mirror.gcr.io/library/caddy:2-alpine
COPY deploy/landing/Caddyfile /etc/caddy/Caddyfile
COPY apps/landing /srv
