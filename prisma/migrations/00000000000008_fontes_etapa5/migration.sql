-- Etapa 5 — três novas fontes de coleta (Novacap, FIEG, SESC GO), todas com
-- consulta pública sem login/CAPTCHA. Aditivo puro: só amplia os valores
-- aceitos por FonteEnum, nenhuma linha existente é tocada.

-- AlterEnum
ALTER TYPE "FonteEnum" ADD VALUE 'NOVACAP';
ALTER TYPE "FonteEnum" ADD VALUE 'FIEG';
ALTER TYPE "FonteEnum" ADD VALUE 'SESC_GO';
