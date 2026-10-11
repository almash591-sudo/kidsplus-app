# Сервис ночного бэкапа: pg_dump той же версии, что сервер (PostgreSQL 18 на Railway), + AWS CLI для bucket.
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli
COPY deploy/backup/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
USER postgres
ENTRYPOINT []
CMD ["/usr/local/bin/backup.sh"]
