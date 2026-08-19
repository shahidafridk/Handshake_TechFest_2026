-- Code values are one-time handshake credentials. A database uniqueness
-- constraint makes collision handling reliable across concurrent requests.
CREATE UNIQUE INDEX "handshake_codes_code_key" ON "handshake_codes"("code");
