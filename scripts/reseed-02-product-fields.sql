-- reseed-02-product-fields.sql  (idempotent — keyed by product id)
-- Populates retail_price, informed_sport, proprietary_blend, amino_spiked,
-- protein_yield for active products confidently matched to Path A data.js.
-- Run AFTER reseed-01-columns.sql.
BEGIN;
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '738af0c5-bdfd-46be-890e-bd2d6e7cb21b'; -- Optimum Nutrition Platinum Pre-Workout
UPDATE public.products SET retail_price = 20, informed_sport = false, proprietary_blend = false WHERE id = '3099922b-46a2-4767-87ee-3359e47729b5'; -- Optimum Nutrition Micronised Creatine Powder
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false WHERE id = '87467312-0a01-4f48-9022-184c8a8e705c'; -- Optimum Nutrition Platinum Creatine Plus
UPDATE public.products SET retail_price = 21.99, informed_sport = false, proprietary_blend = false WHERE id = 'b9d40664-1e1f-4488-8fec-9e053aafcccb'; -- Optimum Nutrition Essential Amino Energy
UPDATE public.products SET retail_price = 48.99, informed_sport = false, proprietary_blend = false WHERE id = 'f2e0d13e-60c7-4b6a-8aa7-dc3304b7671b'; -- Dark Labs Crack (DMHA)
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false WHERE id = '07e3e331-aaa4-4703-927a-f36d5cec38b1'; -- Raw Nutrition (CBUM) Thavage
UPDATE public.products SET retail_price = 22.99, informed_sport = true, proprietary_blend = false WHERE id = 'f59389f4-a69e-4aa5-b49a-dbca746335c3'; -- Optimum Nutrition Essential Amino Energy Elite
UPDATE public.products SET retail_price = 35.99, informed_sport = false, proprietary_blend = false WHERE id = '9b3cc560-40d4-4c70-b1d4-cbbbf5edc63b'; -- The Formula NEUPHORIC
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false WHERE id = 'b752e616-1a03-4e48-8767-602ec3957cb3'; -- JYM Supplement Science Pre JYM
UPDATE public.products SET retail_price = 24.99, informed_sport = true, proprietary_blend = false WHERE id = '943638a7-3c67-4c92-900c-ab0bfa9d7a60'; -- Grenade Pre-Workout
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false WHERE id = '5ab54f66-8e43-4589-bd22-ff6c2023a137'; -- Cellucor C4 Original
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = 'e9ef9227-8a0c-4909-b2e0-3ac548aa94af'; -- MyProtein Origin Pre-Workout
UPDATE public.products SET retail_price = 19.49, informed_sport = false, proprietary_blend = false WHERE id = 'aac47241-0918-455d-bbc6-855aec480bc6'; -- MyProtein Origin Pump Pre-Workout | Stim & Caffeine-Free
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false WHERE id = 'a26b7a7a-348a-461f-8372-a40e234f4d92'; -- MyProtein Impact EAA
UPDATE public.products SET retail_price = 25, informed_sport = false, proprietary_blend = false WHERE id = 'be251f51-6584-43fe-b9e8-9c7c80bb0d19'; -- MyProtein Creapure Creatine
UPDATE public.products SET retail_price = 30, informed_sport = false, proprietary_blend = false WHERE id = '08cea092-e58a-46fb-80d4-343e7ae50170'; -- PhD Nutrition Creapure Creatine
UPDATE public.products SET retail_price = 11.99, informed_sport = false, proprietary_blend = false WHERE id = 'a3f45925-cabd-4a7b-bca8-837824a3f891'; -- CNP Pro Creatine
UPDATE public.products SET retail_price = 1.6, informed_sport = false WHERE id = '6b79b914-ae67-492f-aaef-ee607fde0074'; -- Myprotein Crispy Layered Bar (White Chocolate Peanut)
UPDATE public.products SET retail_price = 49.99, informed_sport = false, proprietary_blend = false WHERE id = 'e70ad247-7a3e-4871-932e-8509b36a211b'; -- Bio-Synergy Creatine Plus®
UPDATE public.products SET retail_price = 27.99, informed_sport = false, proprietary_blend = false WHERE id = '6aa54c84-8f33-4566-aa28-0fdcd5f7c96f'; -- Per4m Per4m EAA
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = '33e5af20-6716-4951-bbb4-944fb9ae3d68'; -- Ghost Lifestyle Ghost Amino
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false WHERE id = '77049b12-f9d1-4e22-b8a7-21b8bb906e93'; -- Warrior DEFENDER EAA
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false WHERE id = '4183135d-b8ea-422f-a87f-3160a9351155'; -- TrainedByJP JP Intra
UPDATE public.products SET retail_price = 24.99, informed_sport = true, proprietary_blend = false WHERE id = '984b410e-6f6c-40cf-82da-93326f4c6465'; -- Applied Nutrition ABE (All Black Everything)
UPDATE public.products SET retail_price = 24.99, informed_sport = true, proprietary_blend = false WHERE id = 'c0f8dde0-6555-4449-9877-3c7ccd410339'; -- Applied Nutrition ABE (All Black Everything)
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '7c8cda9e-0429-43f8-b60e-a258c408a5ec'; -- Strom Sports Nutrition StimuMAX PRO
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false WHERE id = '75933d3d-dca2-4f97-a1db-5c044fe8c897'; -- Ghost Lifestyle Ghost Legend
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = '7245fcd5-e0f6-40bc-963d-bfa39c136044'; -- CNP Professional Intra Workout
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = 'ea967693-15ec-474f-b4e8-68666c2f5919'; -- Naughty Boy Amino Black
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false WHERE id = 'e12593b1-1ed2-4943-8a1d-7d5b89d41026'; -- Warrior EAA+
UPDATE public.products SET retail_price = 49.99, informed_sport = false, proprietary_blend = false WHERE id = '5effd9b6-7fc1-4d33-b314-2c6d29e1a18f'; -- Optimum Nutrition Serious Mass
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false WHERE id = 'ded4ca83-9a22-4e30-a89e-8f57598e7dfa'; -- Applied Nutrition EAA Hydration
UPDATE public.products SET retail_price = 9.99, informed_sport = false, proprietary_blend = false WHERE id = 'eaf361dd-3aa2-4f8f-a964-12a44e8e619c'; -- Optimum Nutrition Electrolyte Powder
UPDATE public.products SET retail_price = 19.99, informed_sport = false, proprietary_blend = false WHERE id = 'c44236d9-b790-4d5f-8f07-ec57eeee5b9c'; -- MyProtein Impact Hydration
UPDATE public.products SET retail_price = 30, informed_sport = false, proprietary_blend = false WHERE id = '1245c55c-7cb2-49ba-9a78-591ec762c785'; -- MyProtein Extreme Recovery Blend
UPDATE public.products SET retail_price = 49.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 91.1 WHERE id = '3ad6dc9b-9bc4-458c-967f-29a9a7b45964'; -- Bio-Synergy Whey Better®
UPDATE public.products SET retail_price = 49, informed_sport = false, proprietary_blend = false WHERE id = '2acd08ed-de53-48a5-8eee-35a8e9fb585a'; -- Sci-MX Omni-MX Hardcore
UPDATE public.products SET retail_price = 42, informed_sport = false, proprietary_blend = false WHERE id = '47cb0fbb-3a6f-485f-815e-8fd204d5411a'; -- USN Muscle Fuel Anabolic
UPDATE public.products SET retail_price = 28, informed_sport = false, proprietary_blend = false WHERE id = '5113a46d-7acf-4dbb-85a2-75747467a922'; -- The Protein Works Recovery Protein
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 66.67 WHERE id = '0cb62204-f9ed-489b-bb26-48220f101359'; -- Bio-Synergy After Dark Protein
UPDATE public.products SET retail_price = 39, informed_sport = false, proprietary_blend = false WHERE id = 'dbb9f5ab-76ae-423a-90c0-7455bec4e3f7'; -- LMNT LMNT Recharge
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false WHERE id = '5e13c87a-1d35-4dd5-a141-43a281bef5e5'; -- Liquid IV Hydration Multiplier
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = '47913a31-e77e-4010-8eb9-048e04e97aaa'; -- Supplement Needs Hydration+
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 70 WHERE id = 'e94b13c4-f7fa-42d2-94b2-8dfcda316311'; -- Warrior Whey Protein
UPDATE public.products SET retail_price = 6.49, informed_sport = true, proprietary_blend = false WHERE id = '7a9d584f-42ca-482f-9ef3-899427702285'; -- Nuun Sport
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = '06ca0109-8e25-481b-b67a-0965d8d737a5'; -- Alpha Neon Synergiz (Maximum Organ Support)
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '7d1a4561-ef23-488e-aa33-f1b0e6f78a51'; -- Chemical Warfare Organ Shield
UPDATE public.products SET retail_price = 39.95, informed_sport = false, proprietary_blend = false WHERE id = 'cc01d814-fe1a-42a8-afbd-465348aad757'; -- HR Labs Defend
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '23ceaea7-3908-423f-b772-8fa750d3704d'; -- CNP Professional Organ Pro / Organ Fix
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = 'f7cc7239-ca28-47e2-93a9-0068c460da2c'; -- Conteh Sports Vitality
UPDATE public.products SET retail_price = 32.99, informed_sport = false, proprietary_blend = false WHERE id = '6774996b-6f6f-4e67-bd31-b93213cea022'; -- Combat Fuel Cycle Support
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '29f1d6fb-5e8f-4c9e-b9a9-9c2a5af1c58b'; -- Alpha Club Alpha Shield
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '57d51861-97dd-4496-b7b9-e55da5c1579b'; -- Alpha Club Alpha Balance
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 70 WHERE id = '7cb28341-5b19-4a0b-b49c-e77bb27182c4'; -- Per4m Advanced Whey
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 73.3 WHERE id = 'e0f73722-771a-4639-b44b-4eeff97ca9f8'; -- Strom Sports Nutrition Essential Max
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 70 WHERE id = 'ca25a9aa-7a1c-4e48-ad97-9774001df070'; -- CNP Whey
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 78.3 WHERE id = '836e9ca3-a02a-4513-b63a-546fd25ea518'; -- Supplement Needs Whey Protein Concentrate
UPDATE public.products SET retail_price = 34.95, informed_sport = false, proprietary_blend = false WHERE id = '60cbe489-96a8-416e-a11b-243e3277caf3'; -- Strom Sports Nutrition EssentialMAX
UPDATE public.products SET retail_price = 27.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 70.6 WHERE id = '767210a6-f16f-48f1-bc45-dc7bc41dc302'; -- USN BlueLab 100% Whey
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 75 WHERE id = '3e09c727-46cc-4a89-b554-8cfb4726141e'; -- Grenade Protein Powder
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '4ea5c8df-7506-42e0-8e77-92775940ae78'; -- PhD Nutrition Pharma Whey
UPDATE public.products SET retail_price = 54.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 78.13 WHERE id = '7bd67e4c-a497-4a9f-b661-8aaf1cfddd78'; -- Dymatize ISO 100 Hydrolyzed
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80.65 WHERE id = 'd5707d0e-4bd4-4b3e-9ee9-c488a8a52b26'; -- Optimum Nutrition Gold Standard 100% Isolate
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 86.67 WHERE id = 'a0fc6933-db03-4c34-a446-a9f89515a206'; -- Per4m Per4m Isolate
UPDATE public.products SET retail_price = 59.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 75 WHERE id = '1f124bce-9367-4c83-93ee-477d4805515a'; -- Optimum Nutrition Platinum Hydrowhey
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 72.73 WHERE id = '5452c5e8-61a9-410a-810f-ef25f8660a41'; -- Optimum Nutrition Gold Standard 100% Casein
UPDATE public.products SET retail_price = 74.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 92 WHERE id = '6626b36e-82c0-47d9-8d5c-a40b47ea41f1'; -- MyProtein Impact Whey Isolate
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 83.33 WHERE id = '90eebf47-deac-4569-88d2-eb57ff598c43'; -- PhD Nutrition 100% Whey Isolate
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 76.67 WHERE id = 'cd61dcae-52e3-4e85-8bac-c3abe7c68ffc'; -- MyProtein Micellar Casein
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '7388ad3f-8336-4813-b2dc-89d3fb0f0370'; -- MyProtein Clear Whey Isolate
UPDATE public.products SET retail_price = 36.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 61.3 WHERE id = 'f42a7d2f-f236-48bc-8dc3-38a2b803dad8'; -- Bio-Synergy Whey Hey®
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 75.76 WHERE id = '4771fef4-7278-488c-b897-95fc65862a94'; -- Reflex Nutrition Micellar Casein
UPDATE public.products SET retail_price = 55.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 68.57 WHERE id = '3c5fcc24-4c21-4b6a-99fd-c71ca3b6680b'; -- Mutant Micellar Casein
UPDATE public.products SET retail_price = 42.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 69.44 WHERE id = 'f3e71a81-361a-4597-96eb-b703ffe2acd7'; -- Dymatize Elite Casein
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '228c4ec5-6038-48fb-9329-c9dbbb53a3f9'; -- CNP Pro Night
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '411a19b8-1935-4c63-b957-07296fbdf447'; -- Warrior Warrior Protein Night
UPDATE public.products SET retail_price = 28.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 77.5 WHERE id = '008f9a15-e961-4802-92fe-fbd7479442b6'; -- Scitec Nutrition Casein Complex
UPDATE public.products SET retail_price = 2, informed_sport = false WHERE id = '8ddfc493-0872-4235-ba25-5091ef172b49'; -- Warrior Crunch Bar (White Chocolate Crisp)
UPDATE public.products SET retail_price = 1.8, informed_sport = false WHERE id = 'e4fd101e-4969-4054-92ab-f02d4cb3d494'; -- Myprotein Layered Protein Bar (Salted Caramel)
UPDATE public.products SET retail_price = 2.5, informed_sport = false WHERE id = '0aa95107-59ac-4c3c-bec9-afc1b10efcb8'; -- Quest Nutrition Quest Bar (Chocolate Chip Cookie Dough)
UPDATE public.products SET retail_price = 3.5 WHERE id = 'f951cf02-9536-4e73-ac62-17bb7a8a33d0'; -- Yfood Classic (Choco)
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '9d3105e7-1760-4da8-ad22-f432114b3ea7'; -- Reflex Nutrition 100% Whey
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 73.3 WHERE id = '251391d2-0064-4c7e-8c51-05dc2bd41559'; -- Sci-MX Ultra Whey
UPDATE public.products SET retail_price = 8.99, proprietary_blend = false WHERE id = 'ba7dbeae-efd5-4edd-bde7-a75a221aa83e'; -- MyProtein Prebiotic Inulin Fibre Powder
UPDATE public.products SET retail_price = 24.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 90.2 WHERE id = '99ec3375-b400-402d-b0a9-c89ad219cc7e'; -- Warrior Clear Whey Isolate
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = '4b12a70e-fcd6-4031-aed7-d4d3f24d1712'; -- Bulk Aftermath
UPDATE public.products SET retail_price = 14.99, informed_sport = false, proprietary_blend = false WHERE id = '6d78db1d-1b56-4e4c-8cd0-c7ecdf696ead'; -- Bulk Electrolyte Powder
UPDATE public.products SET retail_price = 34, informed_sport = false, proprietary_blend = false WHERE id = 'f2d370c9-333c-4c68-ba67-7cbd0e3d7b74'; -- Strom Sports Nutrition Creapure
UPDATE public.products SET retail_price = 34.95, informed_sport = false, proprietary_blend = false WHERE id = 'ff0521c4-d5ac-44d3-9b9e-cdcda133d059'; -- Strom Sports Nutrition SupportMAX
UPDATE public.products SET retail_price = 2, informed_sport = true WHERE id = '0379e5a9-bdae-4b68-aee2-787a3314fd08'; -- Grenade Carb Killa (Chocolate Chip Salted Caramel)
UPDATE public.products SET retail_price = 2.3, informed_sport = false WHERE id = '7da1faee-bd26-4b52-a718-3bbf5f3ab03b'; -- PhD Nutrition Smart Bar (Cookies & Cream)
UPDATE public.products SET retail_price = 10.99, proprietary_blend = false WHERE id = '851dc8e1-85a5-48a1-876d-3c8125499e1b'; -- MyProtein Digestive Enzyme Capsules
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = 'd14398e7-ff1b-4108-b90d-a6ba3b6c30fd'; -- Naughty Boy Menace
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '97f6e3fe-3b27-44c4-a06a-3cbd0db41ad7'; -- Naughty Boy Amino
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false WHERE id = '290eb8dc-d5a7-4b25-a029-a145bfcc12f3'; -- Naughty Boy Life Pac / Life Support
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false WHERE id = '020e20c2-bfd5-4fba-9c5e-59543e94c23b'; -- TrainedByJP Prepare
UPDATE public.products SET retail_price = 9.99 WHERE id = '1cfa7540-1982-4a71-9717-0049c8ccaff0'; -- Nutrition Geeks Magnesium Glycinate 3-in-1
UPDATE public.products SET retail_price = 8.99 WHERE id = '1fb58e7f-9504-4a36-863e-0e4071e0d2e3'; -- Nutrition Geeks Ashwagandha Calm+
UPDATE public.products SET retail_price = 24.99 WHERE id = 'd6daeb9d-85c6-4e5f-80ff-648e689bc0e3'; -- Supplement Needs Vitamin D3 and K2 (MK-7)
UPDATE public.products SET retail_price = 18, informed_sport = false, proprietary_blend = false WHERE id = 'f311ed1d-0f55-44f5-8953-c35d84e6b5ae'; -- Bulk Creatine Monohydrate
UPDATE public.products SET retail_price = 9.99 WHERE id = '259e8f60-1171-4f57-9483-2713b7980792'; -- Nutrition Geeks Vitamin D3 4000iu + K2
UPDATE public.products SET retail_price = 7.99 WHERE id = '706e3947-460b-4253-9810-c88919dd5ecd'; -- Nutrition Geeks Vitamin D 4000iu Max Strength
UPDATE public.products SET retail_price = 9.99 WHERE id = 'efb4879f-a240-4cda-9da0-8fbf094c5596'; -- Nutrition Geeks Zinc Picolinate 3-in-1
UPDATE public.products SET retail_price = 8.99 WHERE id = 'cefa4a30-be66-4083-ac36-e55d9325e39e'; -- Nutrition Geeks Vitamin B12 Dual Power
UPDATE public.products SET retail_price = 8.99 WHERE id = '1adf3959-7166-4232-b2a9-2e1a7dba2f87'; -- Supplement Needs Vitamin D3
UPDATE public.products SET retail_price = 14.99 WHERE id = '31d19045-0da2-4430-83a8-471f1d45507c'; -- Supplement Needs Magnesium Bisglycinate
UPDATE public.products SET retail_price = 17.99 WHERE id = '47dc8c3e-814e-47c1-b463-991058f24a5e'; -- Supplement Needs Ashwagandha Organic Vegan KSM-66
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 73.3 WHERE id = '69978587-1083-4918-9317-18154e60e7f1'; -- Bulk Pure Whey Protein
UPDATE public.products SET retail_price = 1.8, informed_sport = false WHERE id = 'd9f73f59-0366-4949-99e8-2ea520b1c8d7'; -- Bulk Macro Munch (Chocolate Hazelnut)
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '6274433d-cb91-4337-8e21-beb3c1ad97d4'; -- TrainedByJP JP EAA
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = 'cd43b718-9188-4cd1-8125-897cf3437bdd'; -- TrainedByJP JP Hydration
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false WHERE id = '76a1cbdd-a296-4c79-95ef-475c9b56cc88'; -- TrainedByJP Vital Support
UPDATE public.products SET retail_price = 12.99, informed_sport = false, proprietary_blend = false WHERE id = '729856c9-4477-4d37-8dda-386071633bd1'; -- TBJP JP Creatine
UPDATE public.products SET retail_price = 64.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 86.67 WHERE id = '9c77db07-1b5d-4afc-8f86-db826f2b7971'; -- Trained by JP (TBJP) Iso-Pro
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 93.33 WHERE id = '2429dd22-45c3-4088-acf3-4148782bcb00'; -- Bulk Pure Whey Isolate
UPDATE public.products SET retail_price = 32.99, informed_sport = false, proprietary_blend = false WHERE id = '1bf26de0-bf01-4309-bcd6-897d5a269136'; -- HR Labs Hydro
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false WHERE id = '810b5c13-062e-4c50-9033-0fdda083c3b1'; -- Supplement Needs Advanced Liver Support
UPDATE public.products SET retail_price = 24.99 WHERE id = 'ee7f4abb-fa9b-4e2f-ad9c-eb4c24570a02'; -- Supplement Needs Probiotics 50 Billion CFU
UPDATE public.products SET retail_price = 44.99 WHERE id = '6f3b5591-fc9f-45a3-b731-b9f9c2046e1a'; -- Supplement Needs Sleep Stack
UPDATE public.products SET retail_price = 22.99, informed_sport = true, proprietary_blend = false WHERE id = '1932109d-814f-421d-ad6a-7a1b247a33f3'; -- Science in Sport (SiS) REGO Rapid Recovery
UPDATE public.products SET retail_price = 8, informed_sport = false, proprietary_blend = false WHERE id = '2382ce8e-d806-46fd-8f08-13437192935b'; -- Science In Sport (SiS) Go Hydro
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '7460dea0-de2d-4682-90e2-b5c05e80d704'; -- Ghost Lifestyle Ghost Hydration
UPDATE public.products SET retail_price = 7.99, informed_sport = false, proprietary_blend = false WHERE id = '7da65034-eccf-451d-bc81-a66dcf9e5ec7'; -- High5 Zero
UPDATE public.products SET retail_price = 19.99, informed_sport = false, proprietary_blend = false WHERE id = 'e454733a-a69b-4cb6-950c-d01739a9d3a9'; -- Precision Hydration PH 1000
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 71.4 WHERE id = 'dd1f80c9-01b1-40d4-88db-a1841f23bca1'; -- Ghost Whey
UPDATE public.products SET retail_price = 22.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '7f6fe4fe-ec51-42b5-86c7-aad0d1580aac'; -- The Protein Works Whey Protein 80
UPDATE public.products SET retail_price = 35.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '83dbbce5-d74e-402c-9f69-274c2330d7c7'; -- The Protein Works (TPW) 100% Micellar Casein
UPDATE public.products SET retail_price = 2, informed_sport = false WHERE id = '1fab2546-6a25-4fd9-8e49-abf6bb6b362c'; -- Warrior Crunch Bar (White Chocolate Crisp)
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false WHERE id = '57c7f80d-45f9-4476-892d-f9be565f31c2'; -- HR Labs Defib V3
UPDATE public.products SET retail_price = 35, informed_sport = false, proprietary_blend = false WHERE id = '8900fc28-fd3f-4338-9dfe-2257631c2931'; -- Darkstims PRE V4
UPDATE public.products SET retail_price = 50, informed_sport = false, proprietary_blend = false WHERE id = '1c8e0e2d-2fdd-481c-b64f-b298575d69a1'; -- Darkstims Ultra Pre Workout
UPDATE public.products SET retail_price = 9.99, informed_sport = false, proprietary_blend = false WHERE id = '99e438ca-067d-40c5-81f7-f1a26827551a'; -- Nutrition Geeks Pure Creatine Monohydrate Powder
UPDATE public.products SET retail_price = 15, informed_sport = false, proprietary_blend = false WHERE id = 'd1660e89-00db-4abc-bb9f-190c81b617c4'; -- MyProtein Impact Creatine
UPDATE public.products SET retail_price = 19.99, informed_sport = false, proprietary_blend = false WHERE id = '072adf9d-2393-4f98-b433-5939929c7c9f'; -- Supplement Needs Creatine Monohydrate
UPDATE public.products SET retail_price = 18.95, informed_sport = true, proprietary_blend = false WHERE id = 'c8c43264-f973-49a6-87c6-845123603583'; -- Applied Nutrition Creatine Monohydrate
UPDATE public.products SET retail_price = 18, informed_sport = false, proprietary_blend = false WHERE id = '1b11e65b-cdff-4d12-835a-4c9c5ab9bac8'; -- Darkstims Creatine Monohydrate
UPDATE public.products SET retail_price = 14.99, informed_sport = false, proprietary_blend = false WHERE id = '7f5f3751-0e82-463b-8554-6d82cf487eba'; -- Warrior Creatine Monohydrate
UPDATE public.products SET retail_price = 14.99, informed_sport = false, proprietary_blend = false WHERE id = '0b2a6a88-ceaf-4c02-ad40-715d06691118'; -- Warrior Creatine Monohydrate
UPDATE public.products SET retail_price = 23.95, informed_sport = false, proprietary_blend = false WHERE id = '6a8ebcdd-1505-4c9a-9adf-3682359bea61'; -- Applied Nutrition Amino Fuel EAA
UPDATE public.products SET retail_price = 34.95, informed_sport = false, proprietary_blend = false WHERE id = '2567a955-be92-4f70-b147-f908fa80650c'; -- Strom Sports Nutrition EssentialMax
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = 'a3483e0b-65f4-4b68-b2aa-0a81efbbb800'; -- CNP Professional CNP EAA
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false WHERE id = '37f1e686-fc87-4b1e-bf42-6a045d7fdb0f'; -- Mutant GEAAR
UPDATE public.products SET retail_price = 8, informed_sport = true, proprietary_blend = false WHERE id = 'c2293c0e-55ad-43e0-94e7-395121b711d3'; -- Grenade Strawberry Mango BCAA
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false WHERE id = '1c010ee3-88f8-4fae-964d-77df836ddc7e'; -- Supplement Needs Intra EAA+
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false WHERE id = 'e340cef1-3b5e-4b14-b0ef-98c351950191'; -- HR Labs Level Up
UPDATE public.products SET retail_price = 32.99, informed_sport = false, proprietary_blend = false WHERE id = '29022b90-a6b3-493a-8afd-a5a14eb17251'; -- Conteh Sports Essential Amino
UPDATE public.products SET retail_price = 29.95, informed_sport = false, proprietary_blend = false WHERE id = '41c29b06-c6e4-45c3-94f2-8a46ea9935d2'; -- Applied Nutrition Endurance Recovery
UPDATE public.products SET retail_price = 45, informed_sport = false, proprietary_blend = false WHERE id = 'abffbfcd-c048-4c70-9cb9-50798fd97d9f'; -- Reflex Nutrition One Stop Xtreme
UPDATE public.products SET retail_price = 35, informed_sport = false, proprietary_blend = false WHERE id = '24250aa6-3786-4a36-8dfa-384cba90ed01'; -- CNP Professional Pro Recover
UPDATE public.products SET retail_price = 49.99, informed_sport = false, proprietary_blend = false WHERE id = 'db2064d6-118d-4472-8a30-83db7c32c9bc'; -- Applied Nutrition Mass
UPDATE public.products SET retail_price = 29, informed_sport = false, proprietary_blend = false WHERE id = 'c98931d9-0468-4856-974f-332b2b12b129'; -- Strom Sports Nutrition Hydramax
UPDATE public.products SET retail_price = 20, informed_sport = false, proprietary_blend = false WHERE id = 'adaa37c1-d577-4dd4-bed6-c1165f7fc31f'; -- Darkstims Electrolytes
UPDATE public.products SET retail_price = 30, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 84 WHERE id = '6ad62332-baa2-4c39-9930-16147ccf593a'; -- MyProtein Impact Whey Protein
UPDATE public.products SET retail_price = 32.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 77.4 WHERE id = '15db1405-3468-4a8d-b391-d256a0c13d99'; -- Optimum Nutrition Gold Standard 100% Whey
UPDATE public.products SET retail_price = 49.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 70 WHERE id = '451466e0-1474-41ff-a896-8d230adbf3a4'; -- Applied Nutrition Critical Whey
UPDATE public.products SET retail_price = 54.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 86.67 WHERE id = '444c84df-121b-4ca2-923b-12abfb876ba7'; -- CNP Professional CNP Isolate
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 90 WHERE id = 'bb1576f2-90e5-4801-b8ab-33e7c9233d03'; -- Supplement Needs Whey Isolate
UPDATE public.products SET retail_price = 59.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 93.6 WHERE id = 'ed2dde3b-396f-4f7f-8545-b3afc660b4de'; -- Applied Nutrition ISO-XP
UPDATE public.products SET retail_price = 29.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 70 WHERE id = 'b9058eef-f71a-49f7-9672-a264d1a09614'; -- Warrior Whey Protein
UPDATE public.products SET retail_price = 2.3, informed_sport = false WHERE id = '9bd730b4-56ca-4545-bb05-69ed6d48ffb9'; -- Barebells Protein Bar (Cookies & Cream)
UPDATE public.products SET retail_price = 39.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '57f5ba6e-6453-4276-a083-3823774ec779'; -- Strom Sports Nutrition VelosiWHEY Isolate
UPDATE public.products SET retail_price = 64.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 83.3 WHERE id = 'd09943d3-3d37-4349-b34e-6f73a288e7c0'; -- Reflex Nutrition Isolate Pro
UPDATE public.products SET retail_price = 49.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 83.33 WHERE id = '1972920c-69ef-401d-96a5-f4cf358d529b'; -- Applied Nutrition 100% Casein Protein
UPDATE public.products SET retail_price = 34.99, informed_sport = false, proprietary_blend = false, amino_spiked = false, protein_yield = 80 WHERE id = '2c665fd3-91de-45de-8a0d-96b8a0cd06b7'; -- USN 100% Premium Micellar Casein
UPDATE public.products SET retail_price = 2, informed_sport = false WHERE id = 'a925a399-982a-4155-89d5-aee874046618'; -- Applied Nutrition Protein Crunch Bar (Chocolate Caramel)
UPDATE public.products SET retail_price = 1.8, informed_sport = false WHERE id = '163558b4-1ec5-4546-835d-435f42a88dc8'; -- USN Trust Crunch (Chocolate Peanut)
UPDATE public.products SET retail_price = 16.99 WHERE id = 'ab085248-f854-4b93-89f1-574467e8153e'; -- Supplement Needs Advanced Vitamin B Complex
UPDATE public.products SET retail_price = 14.99 WHERE id = 'c3bc42b5-d5c0-404a-8805-7781ad4605fd'; -- Supplement Needs Multi Vitamin and Mineral PRO
UPDATE public.products SET retail_price = 16.99 WHERE id = 'edb28a42-dc88-4628-8387-793f3ad00e95'; -- Supplement Needs Omega 3 High Strength
UPDATE public.products SET retail_price = 34.99 WHERE id = 'e1455253-fb1b-4bbd-a3ff-8116bf97924b'; -- Supplement Needs Greens+
UPDATE public.products SET retail_price = 14.99 WHERE id = 'e18459a8-325f-4766-b11c-ee598c6a9795'; -- Supplement Needs Vitamin C Powder
UPDATE public.products SET retail_price = 6.99 WHERE id = 'ffcbc554-e00d-4738-be16-69599490d11f'; -- Supplement Needs Vitamin K2 (MK-4)
UPDATE public.products SET retail_price = 24, proprietary_blend = false WHERE id = 'aae3c686-cf5a-4ebb-91b4-4c8865b2e6fa'; -- Strom Sports Nutrition ZMAX
UPDATE public.products SET retail_price = 9.99, proprietary_blend = false WHERE id = '0732332e-d2a7-43b4-9257-056305b61c7c'; -- Nutrition Geeks Apple Cider Vinegar+
UPDATE public.products SET retail_price = 6.99, proprietary_blend = false WHERE id = '56128fcc-d33f-4d12-9914-fd3191e6a8ff'; -- Nutrition Geeks Turmeric, Ginger & Black Pepper
UPDATE public.products SET retail_price = 12.95, proprietary_blend = false WHERE id = '90355b09-21f1-4804-801b-38a9518142ba'; -- Applied Nutrition Digestive Enzyme Capsules
UPDATE public.products SET retail_price = 2.3, informed_sport = false WHERE id = '17218104-2c4d-4c5b-864d-846427626503'; -- Fulfil Nutrition Vitamin & Protein Bar (Dark Choc Salted Caramel)
UPDATE public.products SET retail_price = 1.2, informed_sport = false WHERE id = '0a327a09-db76-483e-88ca-b55aacf3d53f'; -- Trek Protein Flapjack (Cocoa Oat)
UPDATE public.products SET retail_price = 3.5 WHERE id = '51111a7f-f338-4e4d-819e-edce85a3b0a1'; -- Huel Ready-to-drink (Vanilla)
UPDATE public.products SET retail_price = 3.75 WHERE id = '7aaebbcb-ac24-4b5f-9156-8f83cfc322b1'; -- Huel Black Edition Ready-to-drink (Chocolate)
UPDATE public.products SET retail_price = 3.5 WHERE id = '588ea7df-6140-4f46-9a08-3cdd7ffc1536'; -- Huel Lite Ready-to-drink (Chocolate)
UPDATE public.products SET retail_price = 3.3 WHERE id = '3457e148-ef53-4197-b48b-33b5d961078b'; -- Saturo Meal Replacement Drink (Chocolate)
UPDATE public.products SET retail_price = 2.8 WHERE id = '8b197150-797e-4590-abb3-19b6b395e174'; -- Jimmy Joy Plenny Drink (Vanilla)
UPDATE public.products SET retail_price = 13 WHERE id = '8b95c03d-709f-466e-a80c-6b7a13688118'; -- SuperDosed Magnesium Glycinate
UPDATE public.products SET retail_price = 25, proprietary_blend = false WHERE id = '68546f63-f123-4e1f-8f46-46802b77de52'; -- SuperDosed Tongkat Ali
UPDATE public.products SET retail_price = 12, proprietary_blend = false WHERE id = '2b3e6bc9-bac1-4ac5-9e97-dc657c9c86c4'; -- SuperDosed Ashwagandha
UPDATE public.products SET retail_price = 39.99, proprietary_blend = false WHERE id = 'e309e1fa-5f75-44a7-9c0c-06d485622ea8'; -- Roar Ambition TestoFuel
UPDATE public.products SET retail_price = 59, proprietary_blend = false WHERE id = '1e297da8-80ab-4aff-b196-1d3be6cd845e'; -- Roar Ambition Prime Male
UPDATE public.products SET retail_price = 75, proprietary_blend = false WHERE id = '77daff05-5644-40a0-882e-4b197790bf50'; -- Hunter Evolve Hunter Test
UPDATE public.products SET retail_price = 10.99, proprietary_blend = false WHERE id = 'e559487b-2259-4178-93cf-c446bb944382'; -- Optibac Probiotics for Every Day
UPDATE public.products SET retail_price = 23.99, proprietary_blend = false WHERE id = 'f5ea5968-f3f7-4f2a-ab56-048920c62386'; -- Optibac Every Day EXTRA
UPDATE public.products SET retail_price = 28.99, proprietary_blend = false WHERE id = '0978e532-a53c-4f80-9ac1-d7872049462a'; -- Optibac Every Day MAX
UPDATE public.products SET retail_price = 10.99, proprietary_blend = false WHERE id = '84a0a5f5-dd3b-485a-a88e-e201529c2b75'; -- Optibac Bifido & Fibre
UPDATE public.products SET retail_price = 15.99, proprietary_blend = false WHERE id = '8aaa999c-cefb-41b0-ae3c-8cc14513ee55'; -- Bio-Kult Everyday Gut (Original)
UPDATE public.products SET retail_price = 44.99, informed_sport = false, proprietary_blend = false WHERE id = '65b9443c-9a83-4f52-bdff-9480ac12c52c'; -- Dark Labs Crack OG
COMMIT;
