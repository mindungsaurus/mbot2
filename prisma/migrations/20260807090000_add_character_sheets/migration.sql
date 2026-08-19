CREATE TABLE "public"."CharacterSheet" (
    "id" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "race" TEXT,
    "age" TEXT,
    "height" TEXT,
    "weight" TEXT,
    "level" INTEGER,
    "className" TEXT,
    "subclassName" TEXT,
    "hpCur" INTEGER,
    "hpMax" INTEGER,
    "ac" INTEGER,
    "strength" INTEGER,
    "dexterity" INTEGER,
    "constitution" INTEGER,
    "intelligence" INTEGER,
    "wisdom" INTEGER,
    "charisma" INTEGER,
    "proficiencies" JSONB,
    "spellSlots" JSONB,
    "metamagic" JSONB,
    "spellVariants" JSONB,
    "spells" JSONB,
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterSheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ItemEquipmentProfile" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "allowedSlots" JSONB NOT NULL,
    "occupiesSlots" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemEquipmentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."CharacterEquipment" (
    "id" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "equipGroupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterEquipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."CharacterFeature" (
    "id" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CharacterSheet_characterName_key" ON "public"."CharacterSheet"("characterName");
CREATE INDEX "CharacterSheet_characterName_idx" ON "public"."CharacterSheet"("characterName");
CREATE UNIQUE INDEX "ItemEquipmentProfile_itemName_key" ON "public"."ItemEquipmentProfile"("itemName");
CREATE INDEX "ItemEquipmentProfile_itemName_idx" ON "public"."ItemEquipmentProfile"("itemName");
CREATE INDEX "CharacterEquipment_characterName_idx" ON "public"."CharacterEquipment"("characterName");
CREATE INDEX "CharacterEquipment_itemName_idx" ON "public"."CharacterEquipment"("itemName");
CREATE INDEX "CharacterFeature_characterName_kind_order_idx" ON "public"."CharacterFeature"("characterName", "kind", "order");

ALTER TABLE "public"."CharacterSheet"
ADD CONSTRAINT "CharacterSheet_characterName_fkey"
FOREIGN KEY ("characterName") REFERENCES "public"."CharacterGold"("name")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ItemEquipmentProfile"
ADD CONSTRAINT "ItemEquipmentProfile_itemName_fkey"
FOREIGN KEY ("itemName") REFERENCES "public"."ItemsInfo"("name")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CharacterEquipment"
ADD CONSTRAINT "CharacterEquipment_characterName_fkey"
FOREIGN KEY ("characterName") REFERENCES "public"."CharacterGold"("name")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CharacterEquipment"
ADD CONSTRAINT "CharacterEquipment_itemName_fkey"
FOREIGN KEY ("itemName") REFERENCES "public"."ItemsInfo"("name")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."CharacterFeature"
ADD CONSTRAINT "CharacterFeature_characterName_fkey"
FOREIGN KEY ("characterName") REFERENCES "public"."CharacterGold"("name")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "public"."CharacterGold" ("name", "gold", "dailyExpense", "isNpc", "friend", "day")
VALUES ('티아', 0, 0, false, NULL, 0)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "public"."ItemsInfo" ("name", "quality", "unit", "type", "noSpace")
VALUES
  ('샤마스의 방식', 1, '개', '장비', '샤마스의방식'),
  ('락시커 로브.', 1, '개', '장비', '락시커로브.'),
  ('워터딥 아세리아 스타폴 로브', 1, '개', '장비', '워터딥아세리아스타폴로브'),
  ('끈적한 슬리퍼', 1, '개', '장비', '끈적한슬리퍼'),
  ('얼. 박. 사.', 1, '개', '장비', '얼.박.사.'),
  ('하룬', 1, '개', '장비', '하룬')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "public"."Inventory" ("owner", "itemName", "amount")
VALUES
  ('티아', '샤마스의 방식', 1),
  ('티아', '락시커 로브.', 1),
  ('티아', '워터딥 아세리아 스타폴 로브', 1),
  ('티아', '끈적한 슬리퍼', 1),
  ('티아', '얼. 박. 사.', 1),
  ('티아', '하룬', 1)
ON CONFLICT ("owner", "itemName") DO NOTHING;

INSERT INTO "public"."CharacterSheet" (
  "id", "characterName", "race", "age", "height", "weight", "level",
  "className", "subclassName", "hpCur", "hpMax", "ac",
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
  "proficiencies", "spellSlots", "metamagic", "spellVariants", "spells", "notes", "updatedAt"
)
VALUES (
  'seed-tia-sheet', '티아', '하이엘프', '16세', '145cm', '28kg', 9,
  '소서러', '정령친화', 49, 49, 13,
  7, 12, 9, 11, 8, 18,
  '["봉","완드","마법서","로브","장궁"]'::jsonb,
  '{"메타매직":5,"LV.1":4,"LV.2":4,"LV.3":2,"LV.4":1}'::jsonb,
  '{"κ":["이중시전","장거리시전","무영창시전"],"λ":["정령투척","신속주문","강렬한 투영"]}'::jsonb,
  '{"LV.3":["울레르의 폭풍"],"LV.4":["아라아드네의 수호목"]}'::jsonb,
  '{"소마법":["냉기분사"],"LV.1":["얼음화살","물창조/제거"],"LV.2":["아감나자의 얼음","비전이동","스닐록의 눈덩이 때"],"LV.3":["블리자드","냉기주입"],"LV.4":["아리아드네의 얼음가지"]}'::jsonb,
  '{"expertise":"없음."}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("characterName") DO NOTHING;

INSERT INTO "public"."ItemEquipmentProfile" ("id", "itemName", "allowedSlots", "occupiesSlots", "notes", "updatedAt")
VALUES
  ('seed-profile-shamas', '샤마스의 방식', '["망토"]'::jsonb, '["망토"]'::jsonb, NULL, CURRENT_TIMESTAMP),
  ('seed-profile-lakseeker-robe', '락시커 로브.', '["옷"]'::jsonb, '["옷"]'::jsonb, NULL, CURRENT_TIMESTAMP),
  ('seed-profile-waterdeep-robe', '워터딥 아세리아 스타폴 로브', '["갑옷"]'::jsonb, '["갑옷"]'::jsonb, NULL, CURRENT_TIMESTAMP),
  ('seed-profile-sticky-slippers', '끈적한 슬리퍼', '["신발"]'::jsonb, '["신발"]'::jsonb, NULL, CURRENT_TIMESTAMP),
  ('seed-profile-ice-doctor', '얼. 박. 사.', '["허리장신구"]'::jsonb, '["허리장신구"]'::jsonb, NULL, CURRENT_TIMESTAMP),
  ('seed-profile-harun', '하룬', '["왼손","오른손"]'::jsonb, '["왼손","오른손"]'::jsonb, '양손무기', CURRENT_TIMESTAMP)
ON CONFLICT ("itemName") DO NOTHING;

INSERT INTO "public"."CharacterEquipment" ("id", "characterName", "itemName", "slots", "equipGroupId", "updatedAt")
VALUES
  ('seed-equip-tia-shamas', '티아', '샤마스의 방식', '["망토"]'::jsonb, 'seed-equip-tia-shamas', CURRENT_TIMESTAMP),
  ('seed-equip-tia-lakseeker', '티아', '락시커 로브.', '["옷"]'::jsonb, 'seed-equip-tia-lakseeker', CURRENT_TIMESTAMP),
  ('seed-equip-tia-waterdeep', '티아', '워터딥 아세리아 스타폴 로브', '["갑옷"]'::jsonb, 'seed-equip-tia-waterdeep', CURRENT_TIMESTAMP),
  ('seed-equip-tia-slippers', '티아', '끈적한 슬리퍼', '["신발"]'::jsonb, 'seed-equip-tia-slippers', CURRENT_TIMESTAMP),
  ('seed-equip-tia-ice-doctor', '티아', '얼. 박. 사.', '["허리장신구"]'::jsonb, 'seed-equip-tia-ice-doctor', CURRENT_TIMESTAMP),
  ('seed-equip-tia-harun', '티아', '하룬', '["왼손","오른손"]'::jsonb, 'seed-equip-tia-harun', CURRENT_TIMESTAMP);

INSERT INTO "public"."CharacterFeature" ("id", "characterName", "kind", "name", "description", "order", "updatedAt")
VALUES
  ('seed-tia-feat-1', '티아', 'FEAT', '카발리즈아의 권능', '매력+1, 2단계 메타매직을 하나 언락합니다. 1단계 메타매직을 하나 언락합니다.', 10, CURRENT_TIMESTAMP),
  ('seed-tia-feat-2', '티아', 'FEAT', '혈통의 증거', '자신이 필드에 있다면, 더이상 설한이 턴의 진행으로 감소하지 않습니다. 모든 동상을 설한으로 치환하며. 또한, 자신이 유발하지 않은 냉기피해 역시 설한이 적용됩니다.', 20, CURRENT_TIMESTAMP),
  ('seed-tia-trait-1', '티아', 'TRAIT', '냉령(冷靈)의 계절을 기다리는 밤', '냉기마법사용시, 대상 하나에게 자신의 다음턴까지 해당주문슬롯d4에 해당하는 임시 보호막을 제공합니다. 해당 피해가, 명중 치명타나 속성 치명을 유발하는경우, 메타매직을 1 회복합니다.', 10, CURRENT_TIMESTAMP),
  ('seed-tia-trait-2', '티아', 'TRAIT', '밍기적', '아군의 승리가 준 확실시되면, 1d20의 6의 판정을 합니다. 판정 실패시. 턴을 넘깁니다.', 20, CURRENT_TIMESTAMP),
  ('seed-tia-trait-3', '티아', 'TRAIT', '절대영도', '자신이 냉기피해를 입히면, 동상을 적용합니다.', 30, CURRENT_TIMESTAMP),
  ('seed-tia-trait-4', '티아', 'TRAIT', '냉기폭발', '''동상'' 이나 ''설한'' 이 적용된 대상이 무력화 될때. 해당지역에 ( 주문보정 )의 냉기폭발피해를 입히며 1의 ''설한''을 중첩시킵니다.', 40, CURRENT_TIMESTAMP),
  ('seed-tia-trait-5', '티아', 'TRAIT', '아도라의 축복', '이동속도 감소에 면역이 됩니다.', 50, CURRENT_TIMESTAMP),
  ('seed-tia-trait-6', '티아', 'TRAIT', '타오르는 생명의 영약', 'HP + 4', 60, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-1', '티아', 'ITEM_EFFECT', '쏟아내리는 파멸', '빙결이 종료된 적은 대상의 다음 턴 동안 추가로 ''둔화'' 됩니다. 또한 적에게 적용되는 ''둔화'' 는 추가적으로 1의 설한을 적용합니다.', 10, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-2', '티아', 'ITEM_EFFECT', '샤마스의 방식', '마법에 의한 방어도+1, 보조행동으로 질주 할 수 있습니다.', 20, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-3', '티아', 'ITEM_EFFECT', '위브 반응회로', '마법에 의한 방어도+1', 30, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-4', '티아', 'ITEM_EFFECT', '다중속성 친화', '주문슬롯 사용시, 임시체력을 3 얻습니다. 착용자가 원소소서러일 경우 각인이 재정렬되어, 원소에만 발동합니다. 대신, 5의 임시체력을 얻습니다.', 40, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-5', '티아', 'ITEM_EFFECT', '오를로트의 친애', '원소마법의 최종피해에 항상 1을 더합니다.', 50, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-6', '티아', 'ITEM_EFFECT', '서리 손아귀', '( 전투마다 )( 보조행동 ) 자신이 이번차례 냉기 피해를 입혔던, 모든 대상에게 1의 냉기 피해를 추가로 입힙니다. 그 이후, 대상들의 모든 누적된 ''설한과 빙결'' 을 잃게하고 각 중첩당 1D8의 순수피해를 입힐여부를 선택할 수 있습니다. 이는 피해가 먼저 적용되며, 이는 모든 대상에 대해 동시에 한순간에 발생합니다.', 60, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-7', '티아', 'ITEM_EFFECT', '반발', '전투마다 한번, 자신이 무력화 되면, 자신을 무력화 한대상은. 12+(매력보정)의 매력내성판정이 유발되며. 실패시 대상의 정상 턴종료 시점까지 ''둔화'' 됩니다.', 70, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-8', '티아', 'ITEM_EFFECT', '에테르형상', '무력화 될 경우, 1분간 투명화합니다. 무력화 상태 종료시 사라집니다.', 80, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-9', '티아', 'ITEM_EFFECT', '솔리드 스탭', '더이상 자신의 이동력과 이동이 ''험지''의 영향을 받지 않습니다. ( 미끄러짐, 거미줄, 덩굴에 의한 속박 ) 등에 면역이 됩니다.', 90, CURRENT_TIMESTAMP),
  ('seed-tia-item-effect-10', '티아', 'ITEM_EFFECT', '주인의 영역', '( 짧은 휴식마다, 보조행동 ) 자신의 위치와, 3m내의 특정 지점에. ''거미줄'' 을 전개합니다. 거미줄은 3분동안 유지되며 ''험지''로 치부됩니다. 전개 되는 순간 위의 모든 적은 14의 운동, 곡예 내성 판정을 유발 받고 실패시 2분간 ''속박'' 되며. 해당 영역내에서 ''속박'' 된 모든 대상은. 자신의 턴이 시작 될시. 2d6의 찌르기 피해와 3의 맹독을 제공 받습니다. 자신은 ''행동'' 으로 언제든 자신의 거미줄 영역으로 되돌아 갈 수 있습니다.', 100, CURRENT_TIMESTAMP);
