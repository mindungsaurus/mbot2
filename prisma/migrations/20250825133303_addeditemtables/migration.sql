-- CreateTable
CREATE TABLE "public"."ItemsInfo" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "quality" TEXT,
    "unit" TEXT,
    "type" TEXT,
    "noSpace" TEXT,

    CONSTRAINT "ItemsInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Inventory" (
    "id" SERIAL NOT NULL,
    "itemName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemsInfo_name_key" ON "public"."ItemsInfo"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_owner_itemName_key" ON "public"."Inventory"("owner", "itemName");
