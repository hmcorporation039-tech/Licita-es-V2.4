-- Aditivo puro: colunas novas e nullable, nenhum dado existente é tocado.
-- Preparação para a Etapa 2 (pagamentos) — dados de contato/cobrança da empresa.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN "email" TEXT,
ADD COLUMN "telefone" TEXT,
ADD COLUMN "responsavel" TEXT,
ADD COLUMN "endereco" TEXT,
ADD COLUMN "cep" TEXT;
