-- CreateTable
CREATE TABLE "public"."CharacterGold" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "gold" INTEGER NOT NULL,
    "dailyExpense" INTEGER NOT NULL,
    "isNpc" BOOLEAN NOT NULL,
    "friend" TEXT,

    CONSTRAINT "CharacterGold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterGold_name_key" ON "public"."CharacterGold"("name");
