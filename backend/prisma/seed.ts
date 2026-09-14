import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Curated SvinoDrop catalogue supplied by the owner. Prices are stored in kopecks.
export const BASE_MARKET_ITEMS = [
  { id: '1', name: 'Desert Eagle | Mint Fan', wear: 'FT', price: 1503, rarity: 'MILSPEC', image: 'https://cdn2.csgo.com/item/image/width=916/Desert%20Eagle%20%7C%20Mint%20Fan%20(Field-Tested).webp' },
  { id: '2', name: 'M4A1-S | Эмфорозавр-S', wear: 'BS', price: 4005, rarity: 'MILSPEC', image: 'https://cdn2.csgo.com/item/image/width=916/M4A1-S%20%7C%20Emphorosaur-S%20(Battle-Scarred).webp' },
  { id: '3', name: 'Glock-18 | Лунная ночь', wear: 'BS', price: 7820, rarity: 'MILSPEC', image: 'https://cdn2.csgo.com/item/image/width=916/Glock-18%20%7C%20Moonrise%20(Battle-Scarred).webp' },
  { id: '4', name: 'USP-S | Bleeding Edge', wear: 'WW', price: 12130, rarity: 'RESTRICTED', image: 'https://cdn2.csgo.com/item/image/width=916/USP-S%20%7C%20Bleeding%20Edge%20(Well-Worn).webp' },
  { id: '5', name: 'AK-47 | Breakthrough', wear: 'WW', price: 23350, rarity: 'RESTRICTED', image: 'https://cdn2.csgo.com/item/image/width=916/AK-47%20%7C%20Breakthrough%20(Well-Worn).webp' },
  { id: '6', name: 'Glock-18 | Shinobu', wear: 'BS', price: 34660, rarity: 'RESTRICTED', image: 'https://cdn2.csgo.com/item/image/width=916/Glock-18%20%7C%20Shinobu%20(Battle-Scarred).webp' },
  { id: '7', name: 'Sawed-Off | Пожиратель', wear: 'WW', price: 48140, rarity: 'RESTRICTED', image: 'https://cdn2.csgo.com/item/image/width=916/Sawed-Off%20%7C%20Devourer%20(Well-Worn).webp' },
  { id: '8', name: 'M4A4 | Смерч', wear: 'FT', price: 64030, rarity: 'CLASSIFIED', image: 'https://cdn2.csgo.com/item/image/width=916/M4A4%20%7C%20Tornado%20(Field-Tested).webp' },
  { id: '9', name: 'Элитный мистер Мохлик | Элитный отряд', wear: 'FN', price: 88010, rarity: 'CLASSIFIED', image: 'https://cdn2.csgo.com/item/image/width=916/The%20Elite%20Mr.%20Muhlik%20%7C%20Elite%20Crew.webp' },
  { id: '10', name: 'M4A1-S | Party Animal', wear: 'MW', price: 147650, rarity: 'CLASSIFIED', image: 'https://cdn2.csgo.com/item/image/width=916/M4A1-S%20%7C%20Party%20Animal%20(Minimal%20Wear).webp' },
  { id: '11', name: 'AWP | Chrome Cannon', wear: 'BS', price: 215660, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/AWP%20%7C%20Chrome%20Cannon%20(Battle-Scarred).webp' },
  { id: '12', name: 'AK-47 | Inheritance', wear: 'BS', price: 272320, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/AK-47%20%7C%20Inheritance%20(Battle-Scarred).webp' },
  { id: '13', name: '★ Kukri Knife | Африканская сетка', wear: 'BS', price: 361430, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Kukri%20Knife%20%7C%20Safari%20Mesh%20(Battle-Scarred).webp' },
  { id: '14', name: '★ Navaja Knife | Ультрафиолет', wear: 'BS', price: 450370, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Navaja%20Knife%20%7C%20Ultraviolet%20(Battle-Scarred).webp' },
  { id: '15', name: '★ Driver Gloves | Convoy', wear: 'BS', price: 630460, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Driver%20Gloves%20%7C%20Convoy%20(Battle-Scarred).webp' },
  { id: '16', name: '★ StatTrak™ Shadow Daggers | Lore', wear: 'MW', price: 750520, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20StatTrak%E2%84%A2%20Shadow%20Daggers%20%7C%20Lore%20(Minimal%20Wear).webp' },
  { id: '17', name: '★ Moto Gloves | Polygon', wear: 'FT', price: 970040, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Moto%20Gloves%20%7C%20Polygon%20(Field-Tested).webp' },
  { id: '18', name: '★ Gut Knife | Волны', wear: 'FN', price: 1200450, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/phase1/%E2%98%85%20Gut%20Knife%20%7C%20Doppler%20(Factory%20New).webp' },
  { id: '19', name: '★ Bayonet | Городская маскировка', wear: 'MW', price: 1500490, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Bayonet%20%7C%20Urban%20Masked%20(Minimal%20Wear).webp' },
  { id: '20', name: '★ Talon Knife | Африканская сетка', wear: 'FT', price: 1754430, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Talon%20Knife%20%7C%20Safari%20Mesh%20(Field-Tested).webp' },
  { id: '21', name: '★ Bayonet | Автотроника', wear: 'BS', price: 2349980, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Bayonet%20%7C%20Autotronic%20(Battle-Scarred).webp' },
  { id: '22', name: '★ Specialist Gloves | Мраморный градиент', wear: 'MW', price: 3428440, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Specialist%20Gloves%20%7C%20Marble%20Fade%20(Minimal%20Wear).webp' },
  { id: '23', name: '★ Nomad Knife | Волны', wear: 'MW', price: 4444690, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/phase3/%E2%98%85%20Nomad%20Knife%20%7C%20Doppler%20(Minimal%20Wear).webp' },
  { id: '24', name: '★ Karambit | Вороненая сталь', wear: 'WW', price: 6534110, rarity: 'COVERT', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20Karambit%20%7C%20Blue%20Steel%20(Well-Worn).webp' },
  { id: '25', name: 'AWP | Пустынная гидра', wear: 'FT', price: 10250440, rarity: 'CONTRABAND', image: 'https://cdn2.csgo.com/item/image/width=916/AWP%20%7C%20Desert%20Hydra%20(Field-Tested).webp' },
  { id: '26', name: '★ M9 Bayonet | Мраморный градиент', wear: 'MW', price: 7842120, rarity: 'CONTRABAND', image: 'https://cdn2.csgo.com/item/image/width=916/%E2%98%85%20M9%20Bayonet%20%7C%20Marble%20Fade%20(Minimal%20Wear).webp' },
  { id: '27', name: 'Glock-18 | Градиент', wear: 'FN', price: 15244270, rarity: 'CONTRABAND', image: 'https://cdn2.csgo.com/item/image/width=916/Glock-18%20%7C%20Fade%20(Factory%20New).webp' },
  { id: '28', name: 'AK-47 | Золотая арабеска', wear: 'FN', price: 20354980, rarity: 'CONTRABAND', image: 'https://cdn2.csgo.com/item/image/width=916/AK-47%20%7C%20Gold%20Arabesque%20(Factory%20New).webp' },
  { id: '29', name: 'AK-47 | Дикий лотос', wear: 'BS', price: 37903250, rarity: 'CONTRABAND', image: 'https://cdn2.csgo.com/item/image/width=916/AK-47%20%7C%20Wild%20Lotus%20(Battle-Scarred).webp' },
  { id: '30', name: 'M4A4 | Вой', wear: 'MW', price: 51351230, rarity: 'CONTRABAND', image: 'https://cdn2.csgo.com/item/image/width=916/M4A4%20%7C%20Howl%20(Minimal%20Wear).webp' },
  { id: '31', name: 'AWP | История о драконе', wear: 'FT', price: 60000230, rarity: 'CONTRABAND', image: 'https://cdn2.csgo.com/item/image/width=916/AWP%20%7C%20Dragon%20Lore%20(Field-Tested).webp' },
  { id: '32', name: 'Sticker | Titan (Holo) | Katowice 2014', wear: 'Holo', price: 740000000, rarity: 'CONTRABAND', image: 'https://cdn.tradeit.gg/csgo%2FSticker%20-%20Titan%20(Holo)%20-%20Katowice%202014_240x152.webp' },
] as const

export const MARKET_ITEMS = BASE_MARKET_ITEMS

export const CASES = [
  { name: 'Генста Свин!', slug: 'gensta-svin', price: 49900, image: 'https://i.ibb.co/tPW2Xyys/b4f6cb58-752e-44ae-885c-bbbe73098ba9-removebg-preview.png', collection: 'Свиноохотники', itemIds: ['1','2','3','4','5','6','7','8','9'], weights: {} },
  { name: 'Хакер Свин!', slug: 'hacker-svin', price: 99900, image: 'https://i.ibb.co/tpP5yjCF/48eb32a1-02f8-438f-b615-996134c84736-removebg-preview.png', collection: 'Свиноохотники', itemIds: ['4','5','6','7','8','9','10','11','12','13','14'], weights: {} },
  { name: 'Мапер Свин!', slug: 'mapper-svin', price: 199900, image: 'https://i.ibb.co/8qK632y/9129ec80-5503-466d-ad65-5a61220e8d5c-removebg-preview.png', collection: 'Свиноохотники', itemIds: ['8','9','10','11','12','13','14','15','16','17','18','19','20'], weights: {} },
  { name: 'Пиратский Свин!', slug: 'pirate-svin', price: 349900, image: 'https://i.ibb.co/tpc6jfbr/9ff2456a-8ed4-43f4-883d-0d98633f1de0.png', collection: 'Свиноохотники', itemIds: ['13','14','15','16','17','18','19','20','21','22','23','24','25'], weights: {} },
  { name: 'Богатый Свин', slug: 'rich-pig', price: 499900, image: 'https://i.ibb.co/nsxsNwr7/fc659d53-b9c9-4f72-8e58-e65a50cc7d80.png', collection: 'Свинячий Окуп', itemIds: ['8','9','10','11','12','13','14','15','16','17','18'], weights: {} },
  { name: 'Мажор Свин', slug: 'major-pig', price: 799900, image: 'https://i.ibb.co/zHtrBHbp/4949a980-100f-4a60-ba88-7617985c3a74.png', collection: 'Свинячий Окуп', itemIds: ['10','11','12','13','14','15','16','17','18','19','20'], weights: {} },
  { name: 'Миллионер Свин', slug: 'millionaire-pig', price: 1499900, image: 'https://i.ibb.co/QFjc9f5x/7873dd36-8b67-44ac-9219-a7daf275efb3.png', collection: 'Свинячий Окуп', itemIds: ['14','15','16','17','18','19','20','21','22','23'], weights: {} },
  { name: 'Миллиардер Свин', slug: 'billionaire-pig', price: 3499900, image: 'https://i.ibb.co/SXLJzPXt/c7760d81-66b9-4df6-a8ab-a21f573f6474.png', collection: 'Свинячий Окуп', itemIds: ['18','19','20','21','22','23','24','25','26','27','28'], weights: {} },
  { name: 'Джордж', slug: 'george-pig', price: 2499900, image: 'https://i.ibb.co/4ZQs3hpH/fef3e74c-e72d-46a6-a2ea-543d16e2cd07.png', collection: 'Свинки Пепы', itemIds: ['17','18','19','20','21','22','23','24'], weights: {} },
  { name: 'Пеппа', slug: 'peppa-pig', price: 5499900, image: 'https://i.ibb.co/gLQQqmM4/68d4958f-3fc1-492a-9308-ed4a335cdc48.png', collection: 'Свинки Пепы', itemIds: ['20','21','22','23','24','25','26','27'], weights: {} },
  { name: 'Мама Свин', slug: 'mama-pig', price: 9999900, image: 'https://i.ibb.co/LhtQ2kgL/26c90aa5-bb72-42c8-bdde-7b44562f30b3-removebg-preview.png', collection: 'Свинки Пепы', itemIds: ['22','23','24','25','26','27','28','29'], weights: {} },
  { name: 'Папа Свин', slug: 'papa-pig', price: 14999900, image: 'https://i.ibb.co/20D5wWcg/2299f886-d122-404b-9d5b-5ab19efc3677.png', collection: 'Свинки Пепы', itemIds: ['24','25','26','27','28','29','30','31'], weights: {} },
  // Magic cases hide their contents and never use the standard roulette.
  // The short lists and low-biased weights keep multi-drops exciting without
  // making the collection a guaranteed profit machine.
  { name: 'Волшебник Свин', slug: 'wizard-pig', price: 199900, image: 'https://i.ibb.co/RT84L404/746c0f7b-65de-46a0-a366-d924619e1aac.png', collection: 'Магические Свиньи', itemIds: ['1','2','3','4','5','6','7','8','9','10','11','12'], weights: {}, openingStyle: 'MAGIC', maxOpen: 1, contentsHidden: true },
  { name: 'Ядовитый Волшебник Свин', slug: 'poison-wizard-pig', price: 399900, image: 'https://i.ibb.co/Y445H4BK/0d5fe353-9512-488c-9f76-504db1cc3276.png', collection: 'Магические Свиньи', itemIds: ['2','3','4','5','6','7','8','9','10','11','12','13','14'], weights: {}, openingStyle: 'MAGIC', maxOpen: 1, contentsHidden: true },
  { name: 'Демонический Волшебник Свин', slug: 'demon-wizard-pig', price: 899900, image: 'https://i.ibb.co/1JfThvvc/ede1a3e2-ccde-4500-86bd-6a963cae8960.png', collection: 'Магические Свиньи', itemIds: ['5','6','7','8','9','10','11','12','13','14','15','16','17','18'], weights: {}, openingStyle: 'MAGIC', maxOpen: 1, contentsHidden: true },
  { name: 'Главный Волшебник Свин', slug: 'arch-wizard-pig', price: 1799900, image: 'https://i.ibb.co/Rph2Q919/0dade8c9-2b72-4a95-a2b3-2889c429bd26-removebg-preview.png', collection: 'Магические Свиньи', itemIds: ['8','9','10','11','12','13','14','15','16','17','18','19','20','21'], weights: {}, openingStyle: 'MAGIC', maxOpen: 1, contentsHidden: true },
] as const

export function dropWeight(price: number) {
  // Visible weights are based only on price: rarer, pricier skins get a smaller chance.
  return Math.max(1, Math.round(100_000 / (price / 100)))
}
export function caseWeight(price: number, casePrice: number) {
  // The return centre sits below the case price. High-value skins remain
  // possible, but are no longer frequent enough to make normal openings pay
  // for themselves over time.
  const ratio = Math.max(price / casePrice, .01)
  const centre = Math.exp(-Math.pow(Math.log(ratio / .52), 2) / 1.45)
  const highPenalty = ratio > 1 ? .48 : 1
  return Math.max(1, Math.round(35 + 1_050 * centre * highPenalty));
}
export function magicWeight(price: number, casePrice: number) {
  // Several prizes can appear in one cast, so magic has a slightly lower
  // return centre than regular cases.
  const ratio = price / casePrice
  const centre = Math.exp(-Math.pow(Math.log(Math.max(ratio, .01) / .46), 2) / 1.05)
  const lowPenalty = ratio < .16 ? .18 : 1
  const highPenalty = ratio > 1 ? .38 : 1
  return Math.max(2, Math.round(65 + 980 * centre * lowPenalty * highPenalty))
}

async function main() {
  for (const item of MARKET_ITEMS) {
    await prisma.item.upsert({
      where: { id: item.id },
      update: { name: item.name, wear: item.wear, price: item.price, image: item.image, rarity: item.rarity, active: true },
      create: { ...item, active: true },
    })
  }

  // Keep legacy records for historic inventories, but never show or drop them again.
  await prisma.item.updateMany({ where: { id: { notIn: MARKET_ITEMS.map((item) => item.id) } }, data: { active: false } })
  await prisma.inventory.updateMany({ where: { itemId: { notIn: MARKET_ITEMS.map((item) => item.id) }, removedAt: null }, data: { removedAt: new Date() } })

  for (const config of CASES) {
    const magic = 'openingStyle' in config && config.openingStyle === 'MAGIC'
    const maxOpen = 'maxOpen' in config ? config.maxOpen : 4
    const contentsHidden = 'contentsHidden' in config ? config.contentsHidden : false
    const caseData = await prisma.case.upsert({
      where: { slug: config.slug },
      update: { name: config.name, price: config.price, image: config.image, collection: config.collection || 'Свиноохотники', active: true, openingStyle: magic ? 'MAGIC' : 'REEL', maxOpen, contentsHidden },
      create: { name: config.name, slug: config.slug, price: config.price, image: config.image, collection: config.collection || 'Свиноохотники', openingStyle: magic ? 'MAGIC' : 'REEL', maxOpen, contentsHidden },
    })
    const contents = MARKET_ITEMS.filter((item) => (config.itemIds as readonly string[]).includes(item.id))
    await prisma.$transaction([
      prisma.caseItem.deleteMany({ where: { caseId: caseData.id } }),
      prisma.caseItem.createMany({ data: contents.map((item) => ({ caseId: caseData.id, itemId: item.id, weight: config.weights?.[item.id as keyof typeof config.weights] || (magic ? magicWeight(item.price, config.price) : caseWeight(item.price, config.price)) })) }),
    ])
  }

  console.log(`SvinoDrop: updated ${MARKET_ITEMS.length} live skins and ${CASES.length} case collections.`)
}

if (!process.env.SKIP_SEED_EXECUTION) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  }).finally(async () => {
    await prisma.$disconnect()
  })
}
