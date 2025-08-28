-- CreateTable
CREATE TABLE "public"."ItemAlias" (
    "id" SERIAL NOT NULL,
    "alias" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,

    CONSTRAINT "ItemAlias_pkey" PRIMARY KEY ("id")
);
