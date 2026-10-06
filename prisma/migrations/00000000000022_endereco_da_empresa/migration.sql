-- Endereço completo da empresa (o CEP preenche rua/bairro/cidade/UF). Somente aditiva.

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "endereco_numero" TEXT,
ADD COLUMN     "endereco_complemento" TEXT,
ADD COLUMN     "endereco_bairro" TEXT,
ADD COLUMN     "endereco_cidade" TEXT,
ADD COLUMN     "endereco_uf" CHAR(2);
