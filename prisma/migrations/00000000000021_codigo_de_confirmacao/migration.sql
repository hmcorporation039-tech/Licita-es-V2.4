-- Confirmação de e-mail por código de 6 dígitos (substitui o link). Somente aditiva.
-- `attempts` conta as tentativas erradas do código; ao chegar no limite o código é invalidado.
ALTER TABLE "auth_tokens" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
