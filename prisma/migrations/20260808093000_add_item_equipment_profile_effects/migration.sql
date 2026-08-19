CREATE TABLE "ItemEquipmentProfileEffect" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemEquipmentProfileEffect_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ItemEquipmentProfileEffect_profileId_order_idx" ON "ItemEquipmentProfileEffect"("profileId", "order");

ALTER TABLE "ItemEquipmentProfileEffect" ADD CONSTRAINT "ItemEquipmentProfileEffect_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ItemEquipmentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
