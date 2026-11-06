-- Textos dos portais com tag HTML, entidade sem "&" ("PRESTACcedil;Atilde;O") ou
-- caractere de controle (vistos em produção em 06/11/2026). A coleta passou a limpar
-- na gravação (src/lib/textoLimpo.ts); esta migração limpa o que já estava gravado.
-- Só toca as linhas que têm o problema.

CREATE OR REPLACE FUNCTION pg_temp.limpar_texto(t text) RETURNS text AS $$
  SELECT CASE WHEN t IS NULL THEN NULL ELSE btrim(regexp_replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(regexp_replace(regexp_replace(t, '</?[a-zA-Z][a-zA-Z0-9]*([[:space:]][^<>]*)?/?>', ' ', 'g'), E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', ' ', 'g'), '&aacute;', 'á'), 'aacute;', 'á'), '&Aacute;', 'Á'), 'Aacute;', 'Á'), '&agrave;', 'à'), 'agrave;', 'à'), '&Agrave;', 'À'), 'Agrave;', 'À'), '&acirc;', 'â'), 'acirc;', 'â'), '&Acirc;', 'Â'), 'Acirc;', 'Â'), '&atilde;', 'ã'), 'atilde;', 'ã'), '&Atilde;', 'Ã'), 'Atilde;', 'Ã'), '&eacute;', 'é'), 'eacute;', 'é'), '&Eacute;', 'É'), 'Eacute;', 'É'), '&ecirc;', 'ê'), 'ecirc;', 'ê'), '&Ecirc;', 'Ê'), 'Ecirc;', 'Ê'), '&egrave;', 'è'), 'egrave;', 'è'), '&Egrave;', 'È'), 'Egrave;', 'È'), '&iacute;', 'í'), 'iacute;', 'í'), '&Iacute;', 'Í'), 'Iacute;', 'Í'), '&oacute;', 'ó'), 'oacute;', 'ó'), '&Oacute;', 'Ó'), 'Oacute;', 'Ó'), '&ocirc;', 'ô'), 'ocirc;', 'ô'), '&Ocirc;', 'Ô'), 'Ocirc;', 'Ô'), '&otilde;', 'õ'), 'otilde;', 'õ'), '&Otilde;', 'Õ'), 'Otilde;', 'Õ'), '&uacute;', 'ú'), 'uacute;', 'ú'), '&Uacute;', 'Ú'), 'Uacute;', 'Ú'), '&uuml;', 'ü'), 'uuml;', 'ü'), '&Uuml;', 'Ü'), 'Uuml;', 'Ü'), '&ccedil;', 'ç'), 'ccedil;', 'ç'), '&Ccedil;', 'Ç'), 'Ccedil;', 'Ç'), '&amp;', '&'), '&quot;', '"'), '&nbsp;', ' '), '&ordm;', 'º'), '&ordf;', 'ª'), '[ \t]{2,}', ' ', 'g')) END
$$ LANGUAGE sql IMMUTABLE;

UPDATE "tenders" SET
  "objeto" = pg_temp.limpar_texto("objeto"),
  "objeto_resumido" = pg_temp.limpar_texto("objeto_resumido"),
  "orgao" = pg_temp.limpar_texto("orgao"),
  "unidade" = pg_temp.limpar_texto("unidade")
WHERE concat_ws(' ', "objeto", "objeto_resumido", "orgao", "unidade") ~ E'(<[a-zA-Z/]|[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]|(acute|grave|circ|tilde|uml|cedil|amp|quot|nbsp|ordm|ordf);)';

UPDATE "tender_items" SET
  "descricao" = pg_temp.limpar_texto("descricao"),
  "descricao_detalhada" = pg_temp.limpar_texto("descricao_detalhada")
WHERE concat_ws(' ', "descricao", "descricao_detalhada") ~ E'(<[a-zA-Z/]|[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]|(acute|grave|circ|tilde|uml|cedil|amp|quot|nbsp|ordm|ordf);)';
