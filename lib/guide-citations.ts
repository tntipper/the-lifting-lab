// Verified scientific references for each /guide/[category] page.
// Every entry below was confirmed by fetching the source URL and reading enough
// of it to verify it supports a claim made in the matching guide (research pass
// 2026-06-15). Unverified / gap claims from that pass are deliberately excluded.
// `slug` keys match lib/guides.ts (and the Supabase `category` column).

export type Citation = {
  authors: string // e.g. "Kreider RB, et al." or an organisation name
  year: string
  title: string
  source: string // journal + locator, or publisher
  url: string
}

// Shared sources referenced by more than one guide.
const ISSN_PROTEIN: Citation = {
  authors: 'Jäger R, et al.',
  year: '2017',
  title: 'International Society of Sports Nutrition Position Stand: protein and exercise',
  source: 'J Int Soc Sports Nutr 14:20',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/',
}
const WOLFE_BCAA: Citation = {
  authors: 'Wolfe RR',
  year: '2017',
  title: 'Branched-chain amino acids and muscle protein synthesis in humans: myth or reality?',
  source: 'J Int Soc Sports Nutr 14:30',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5568273/',
}
const ACSM_FLUID: Citation = {
  authors: 'Sawka MN, et al. (ACSM)',
  year: '2007',
  title: 'American College of Sports Medicine position stand: exercise and fluid replacement',
  source: 'Med Sci Sports Exerc 39(2):377-390',
  url: 'https://pubmed.ncbi.nlm.nih.gov/17277604/',
}
const BURKE_CARBS: Citation = {
  authors: 'Burke LM, et al.',
  year: '2011',
  title: 'Carbohydrates for training and competition',
  source: 'J Sports Sci 29 Suppl 1:S17-27',
  url: 'https://pubmed.ncbi.nlm.nih.gov/21660838/',
}
const KREIDER_CREATINE: Citation = {
  authors: 'Kreider RB, et al.',
  year: '2017',
  title:
    'International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine',
  source: 'J Int Soc Sports Nutr 14:18',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5469049/',
}
const NHS_VIT_D: Citation = {
  authors: 'NHS',
  year: '',
  title: 'Vitamins and minerals — Vitamin D',
  source: 'National Health Service (UK)',
  url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-d/',
}
const NHS_VIT_A: Citation = {
  authors: 'NHS',
  year: '',
  title: 'Vitamins and minerals — Vitamin A',
  source: 'National Health Service (UK)',
  url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-a/',
}
const NHS_VIT_E: Citation = {
  authors: 'NHS',
  year: '',
  title: 'Vitamins and minerals — Vitamin E',
  source: 'National Health Service (UK)',
  url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-e/',
}
const NHS_IRON: Citation = {
  authors: 'NHS',
  year: '',
  title: 'Vitamins and minerals — Iron',
  source: 'National Health Service (UK)',
  url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/iron/',
}
const ODS_OMEGA3: Citation = {
  authors: 'NIH Office of Dietary Supplements',
  year: '',
  title: 'Omega-3 Fatty Acids — Fact Sheet for Health Professionals',
  source: 'National Institutes of Health (US)',
  url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/',
}

export const GUIDE_CITATIONS: Record<string, Citation[]> = {
  creatine: [KREIDER_CREATINE],
  whey: [
    ISSN_PROTEIN,
    {
      authors: 'Informed Sport (LGC)',
      year: '',
      title: 'Informed Sport supplement testing and certification programme',
      source: 'LGC Group',
      url: 'https://sport.wetestyoutrust.com/',
    },
  ],
  'whey-isolate': [
    {
      authors: 'Huppertz T, Gazi I',
      year: '2016',
      title: 'Lactose in dairy ingredients: effect on processing and storage stability',
      source: 'J Dairy Sci 99(8):6842-6851',
      url: 'https://pubmed.ncbi.nlm.nih.gov/26387022/',
    },
    ISSN_PROTEIN,
  ],
  'pre-workout': [
    {
      authors: 'Guest NS, et al.',
      year: '2021',
      title:
        'International society of sports nutrition position stand: caffeine and exercise performance',
      source: 'J Int Soc Sports Nutr 18:1',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7777221/',
    },
    {
      authors: 'Vårvik FT, Bjørnsen T, Gonzalez AM',
      year: '2021',
      title:
        'Acute effect of citrulline malate on repetition performance during strength training: a systematic review and meta-analysis',
      source: 'Int J Sport Nutr Exerc Metab 31(4):350-358',
      url: 'https://pubmed.ncbi.nlm.nih.gov/34010809/',
    },
    {
      authors: 'Rhim HC, et al.',
      year: '2020',
      title:
        'Effect of citrulline on post-exercise rating of perceived exertion, muscle soreness, and blood lactate levels: a systematic review and meta-analysis',
      source: 'J Sport Health Sci 9(6):553-561',
      url: 'https://pubmed.ncbi.nlm.nih.gov/33308806/',
    },
    {
      authors: 'Trexler ET, et al.',
      year: '2015',
      title: 'International society of sports nutrition position stand: Beta-Alanine',
      source: 'J Int Soc Sports Nutr 12:30',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4501114/',
    },
  ],
  eaas: [WOLFE_BCAA, ISSN_PROTEIN],
  'intra-workout': [WOLFE_BCAA, ACSM_FLUID],
  casein: [
    {
      authors: 'Boirie Y, et al.',
      year: '1997',
      title: 'Slow and fast dietary proteins differently modulate postprandial protein accretion',
      source: 'Proc Natl Acad Sci USA 94(26):14930-14935',
      url: 'https://pubmed.ncbi.nlm.nih.gov/9405716/',
    },
    {
      authors: 'Res PT, et al.',
      year: '2012',
      title: 'Protein ingestion before sleep improves postexercise overnight recovery',
      source: 'Med Sci Sports Exerc 44(8):1560-1569',
      url: 'https://pubmed.ncbi.nlm.nih.gov/22330017/',
    },
    {
      authors: 'Trommelen J, van Loon LJC',
      year: '2016',
      title:
        'Pre-sleep protein ingestion to improve the skeletal muscle adaptive response to exercise training',
      source: 'Nutrients 8(12):763',
      url: 'https://pubmed.ncbi.nlm.nih.gov/27916799/',
    },
    ISSN_PROTEIN,
  ],
  'post-workout': [
    {
      authors: 'Witard OC, et al.',
      year: '2014',
      title:
        'Myofibrillar muscle protein synthesis rates subsequent to a meal in response to increasing doses of whey protein at rest and after resistance exercise',
      source: 'Am J Clin Nutr 99(1):86-95',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24257722/',
    },
    {
      authors: 'Morton RW, et al.',
      year: '2018',
      title:
        'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults',
      source: 'Br J Sports Med 52(6):376-384',
      url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
    },
    {
      authors: 'Schoenfeld BJ, Aragon AA, Krieger JW',
      year: '2013',
      title: 'The effect of protein timing on muscle strength and hypertrophy: a meta-analysis',
      source: 'J Int Soc Sports Nutr 10:53',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24299050/',
    },
    {
      authors: 'Aragon AA, Schoenfeld BJ',
      year: '2013',
      title: 'Nutrient timing revisited: is there a post-exercise anabolic window?',
      source: 'J Int Soc Sports Nutr 10:5',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23360586/',
    },
    BURKE_CARBS,
    KREIDER_CREATINE,
  ],
  hydration: [
    ACSM_FLUID,
    {
      authors: 'Baker LB',
      year: '2017',
      title:
        'Sweating rate and sweat sodium concentration in athletes: a review of methodology and intra/interindividual variability',
      source: 'Sports Med 47(Suppl 1):111-128',
      url: 'https://pubmed.ncbi.nlm.nih.gov/28332116/',
    },
    BURKE_CARBS,
  ],
  'protein-bar': [
    {
      authors: 'Koutsou GA, et al.',
      year: '1996',
      title:
        'Dose-related gastrointestinal response to the ingestion of either isomalt, lactitol or maltitol in milk chocolate',
      source: 'Eur J Clin Nutr 50(1):17-21',
      url: 'https://pubmed.ncbi.nlm.nih.gov/8617186/',
    },
    {
      authors: 'Livesey G',
      year: '2003',
      title:
        'Health potential of polyols as sugar replacers, with emphasis on low glycaemic properties',
      source: 'Nutr Res Rev 16(2):163-191',
      url: 'https://pubmed.ncbi.nlm.nih.gov/19087388/',
    },
  ],
  'meal-replacement': [
    {
      authors: 'Astbury NM, et al.',
      year: '2019',
      title:
        'A systematic review and meta-analysis of the effectiveness of meal replacements for weight loss',
      source: 'Obes Rev 20(4):569-587',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30675990/',
    },
  ],
  'gut-digestion': [
    {
      authors: 'Hill C, et al.',
      year: '2014',
      title:
        'ISAPP consensus statement on the scope and appropriate use of the term probiotic',
      source: 'Nat Rev Gastroenterol Hepatol 11(8):506-514',
      url: 'https://pubmed.ncbi.nlm.nih.gov/24912386/',
    },
    {
      authors: 'Gibson GR, et al.',
      year: '2017',
      title: 'ISAPP consensus statement on the definition and scope of prebiotics',
      source: 'Nat Rev Gastroenterol Hepatol 14(8):491-502',
      url: 'https://pubmed.ncbi.nlm.nih.gov/28611480/',
    },
    {
      authors: 'NIDDK (NIH)',
      year: '',
      title: 'Treatment for lactose intolerance',
      source: 'National Institute of Diabetes and Digestive and Kidney Diseases (US)',
      url: 'https://www.niddk.nih.gov/health-information/digestive-diseases/lactose-intolerance/treatment',
    },
    {
      authors: 'Leis R, et al.',
      year: '2020',
      title:
        'Effects of prebiotic and probiotic supplementation on lactase deficiency and lactose intolerance: a systematic review of controlled trials',
      source: 'Nutrients 12(5):1487',
      url: 'https://pubmed.ncbi.nlm.nih.gov/32443748/',
    },
    {
      authors: 'NHS',
      year: '',
      title: 'How to get more fibre into your diet',
      source: 'National Health Service (UK)',
      url: 'https://www.nhs.uk/live-well/eat-well/digestive-health/how-to-get-more-fibre-into-your-diet/',
    },
  ],
  'hormone-support': [
    {
      authors: 'Balasubramanian A, et al.',
      year: '2019',
      title:
        'Testosterone imposters: an analysis of popular online testosterone boosting supplements',
      source: 'J Sex Med 16(2):203-212',
      url: 'https://pubmed.ncbi.nlm.nih.gov/30770069/',
    },
    {
      authors: 'NCCIH (NIH)',
      year: '',
      title: 'Ashwagandha',
      source: 'National Center for Complementary and Integrative Health (US)',
      url: 'https://www.nccih.nih.gov/health/ashwagandha',
    },
    {
      authors: 'Ho CY, Hsu CH, Chien TJ',
      year: '2026',
      title:
        'Herbal dietary supplements for erectile dysfunction: a systematic review and meta-analysis of randomized-controlled trials',
      source: 'J Tradit Complement Med 16(1):109-120',
      url: 'https://pubmed.ncbi.nlm.nih.gov/41696741/',
    },
  ],
  'cycle-support': [
    {
      authors: 'NCCIH (NIH)',
      year: '',
      title: 'Milk Thistle',
      source: 'National Center for Complementary and Integrative Health (US)',
      url: 'https://www.nccih.nih.gov/health/milk-thistle',
    },
    ODS_OMEGA3,
  ],
  vitamin: [NHS_VIT_D, ODS_OMEGA3, NHS_VIT_A, NHS_VIT_E, NHS_IRON],
  multivitamin: [NHS_VIT_A, NHS_VIT_D, NHS_VIT_E, NHS_IRON],
  'vitamin-d': [
    NHS_VIT_D,
    {
      authors: 'van den Heuvel EGHM, et al.',
      year: '2024',
      title:
        'Comparison of the effect of daily vitamin D2 and vitamin D3 supplementation on serum 25-hydroxyvitamin D concentration: a systematic review and meta-analysis',
      source: 'Adv Nutr 15(1):100133',
      url: 'https://pubmed.ncbi.nlm.nih.gov/37865222/',
    },
    {
      authors: 'Alnafisah RY, et al.',
      year: '2024',
      title: 'The impact and efficacy of vitamin D fortification',
      source: 'Nutrients 16(24):4322',
      url: 'https://pubmed.ncbi.nlm.nih.gov/39770943/',
    },
  ],
  zma: [
    {
      authors: 'NHS',
      year: '',
      title: 'Vitamins and minerals — Others (copper)',
      source: 'National Health Service (UK)',
      url: 'https://www.nhs.uk/conditions/vitamins-and-minerals/others/',
    },
  ],
}

export function getCitations(slug: string): Citation[] {
  return GUIDE_CITATIONS[slug] ?? []
}

export function formatCitation(c: Citation): string {
  const lead = c.year ? `${c.authors} (${c.year}).` : `${c.authors}.`
  return `${lead} ${c.title}. ${c.source}.`
}
