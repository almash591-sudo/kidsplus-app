-- Озвучка, упавшая из-за лимита частоты ProxyAPI (429) или пустого баланса (402), — снова в очередь:
-- теперь такие ответы не тратят попытки, worker просто ждёт.
UPDATE "media_assets" SET "status" = 'pending', "attempts" = 0
WHERE "source" = 'tts' AND "status" = 'failed' AND ("error" LIKE '% 429:%' OR "error" LIKE '% 402:%');
