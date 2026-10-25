CREATE TABLE "tender_favoritos" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tender_favoritos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tender_favoritos_company_id_tender_id_key" ON "tender_favoritos"("company_id", "tender_id");

CREATE INDEX "tender_favoritos_company_id_idx" ON "tender_favoritos"("company_id");

ALTER TABLE "tender_favoritos" ADD CONSTRAINT "tender_favoritos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tender_favoritos" ADD CONSTRAINT "tender_favoritos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tender_favoritos" ADD CONSTRAINT "tender_favoritos_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
