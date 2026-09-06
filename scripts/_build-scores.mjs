// Generator: precomputes clinical scores (0-100) for every Path A product and
// writes them to lib/scores.ts as a static lookup keyed by `${brand}|${name}`.
//
// The scoring functions below are copied VERBATIM from Path A's webapp/index.html
// (the single source of truth) so Path B scores match the live site exactly.
//
// Run:  node scripts/_build-scores.mjs
// Output: lib/scores.ts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Path A data.js (workspace copy). Read-only.
const DATA_JS = 'C:/Users/tobia/.openclaw/workspace/theliftinglab/webapp/data.js'

// ---- load window.DADB from data.js ----
const dataSrc = fs.readFileSync(DATA_JS, 'utf8')
const globalThisWindow = {}
// data.js is `window.DADB = {...}` — evaluate against a fake window
const fn = new Function('window', dataSrc + '\nreturn window.DADB;')
const DADB = fn(globalThisWindow)

// ================= SCORING (verbatim from Path A index.html) =================
/* ---------- helpers ---------- */
const num = (v) => { if (v==null) return 0; const m = String(v).match(/-?\d+(\.\d+)?/); return m?parseFloat(m[0]):0; };
const money = (n) => "£"+ (Math.round(n*100)/100).toFixed(2);
const yes = (v) => /^y/i.test(String(v||""));
function pureCitrulline(str){
  const g = num(str);
  if (/malate/i.test(str)) return g*(2/3);
  return g;
}
function clinicalServings(str){
  const s = String(str);
  const slash = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (slash) return Math.min(+slash[1], +slash[2]);
  return num(s);
}
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

const SCORERS = {
  pre_workouts(p){
    const cit = pureCitrulline(p["L-Citrulline dose per full serving"]);
    const ba  = num(p["Beta-Alanine dose per full serving"]);
    const caf = num(p["Caffeine dose per full serving"]);
    const serv = clinicalServings(p["Total Servings"]);
    const cost = serv? p["Average UK Retail Price (£)"]/serv : null;
    const propBlend = yes(p["Proprietary Blend"]);
    const mCit = clamp(cit/8,0,1);
    const mBa  = clamp(ba/3.2,0,1);
    let mCaf;
    if (caf>=200 && caf<=400) mCaf=1;
    else if (caf<200) mCaf=clamp(caf/200,0,1);
    else mCaf=clamp(1-(caf-400)/300,0,1);
    const betaine  = num(p["Betaine dose per full serving"]);
    const tyrRaw   = num(p["L-Tyrosine dose per full serving"]);
    const isNalt   = yes(p["NALT Flag"]);
    const tyr      = isNalt ? tyrRaw*0.5 : tyrRaw;
    const theanine = num(p["L-Theanine dose per full serving"]);
    const taurine  = num(p["Taurine dose per full serving"]);
    const cdp      = num(p["CDP-Choline dose per full serving"]);
    const secMatch = clamp(betaine/2500,0,1)*0.03 + clamp(tyr/2000,0,1)*0.03
                   + clamp(theanine/200,0,1)*0.03 + clamp(taurine/2000,0,1)*0.03
                   + clamp(cdp/300,0,1)*0.03;
    const match = mCit*0.35 + mBa*0.25 + mCaf*0.25 + secMatch;
    const propPenalty = propBlend ? 0.85 : 1;
    const score = match*10*propPenalty;
    return {score, cost, match, ref:true, metrics:[], flags:[]};
  },
  creatine(p){
    const ppd = num(p["Price per 5g Clinical Dose (£)"]);
    const creapure = yes(p["Creapure Flag"]);
    const mPurity = creapure ? 1 : 0.90;
    const mValue  = clamp((0.60-ppd)/0.42,0,1);
    const W = { value:0.55, purity:0.45 };
    const match = mValue*W.value + mPurity*W.purity;
    const score = match*10;
    return {score, cost:ppd, match, ref:true, metrics:[], flags:[]};
  },
  eaas(p){
    const eaa = num(p["Total EAAs per serving (grams)"]);
    const bcaaOnly = yes(p["BCAA Only Flag"]);
    const hyd = !/none/i.test(String(p["Hydration/Osmolytes Included"]||"none"));
    const cost = num(p["Price per True Serving (£)"]);
    const mDose = clamp(eaa/10,0,1);
    const mSpectrum = bcaaOnly ? 0 : 1;
    const mHyd = hyd ? 1 : 0.5;
    const W = { dose:0.60, spectrum:0.35, hyd:0.05 };
    const propBlend = yes(p["Proprietary Blend"]);     const propPenalty = propBlend ? 0.85 : 1;     const match = (mDose*W.dose + mSpectrum*W.spectrum + mHyd*W.hyd) * propPenalty;
    const score = match*10;
    return {score, cost, match, ref:true, metrics:[], flags:[]};
  },
  cycle_support(p){
    const nac   = num(p["NAC dose per serving (mg)"]);
    const tudca = num(p["TUDCA dose per serving (mg)"]);
    const berg  = num(p["Citrus Bergamot dose per serving (mg)"]);
    const coq   = num(p["CoQ10 dose per serving (mg)"]);
    const dha   = num(p["Omega-3/DHA dose per serving (mg)"]);
    const price = num(p["Average UK Retail Price (£)"]);
    const propBlend = yes(p["Proprietary Blend"]);
    const mNac  = clamp(nac/600,0,1);
    const mTud  = clamp(tudca/250,0,1);
    const mBerg = clamp(berg/500,0,1);
    const mCoq  = clamp(coq/100,0,1);
    const mDha  = clamp(dha/1000,0,1);
    const W = { nac:0.40, tud:0.30, berg:0.15, coq:0.10, dha:0.05 };
    const match = mNac*W.nac + mTud*W.tud + mBerg*W.berg + mCoq*W.coq + mDha*W.dha;
    const propPenalty = propBlend ? 0.85 : 1;
    const score = match*10*propPenalty;
    return {score, cost:price, match, ref:true, metrics:[], flags:[]};
  },
  whey_normal:(p)=>wheyScore(p,82), whey_isolate:(p)=>wheyScore(p,90), casein:(p)=>wheyScore(p,80),
  hydration(p){
    const na = num(p["Sodium dose per serving (mg)"]);
    const k  = num(p["Potassium dose per serving (mg)"]);
    const mg = num(p["Magnesium dose per serving (mg)"]);
    const sugar = yes(p["Added Sugar Flag"]);
    const cost = num(p["Price per True Serving (£)"]);
    const mNa=clamp(na/1000,0,1), mK=clamp(k/200,0,1), mMg=clamp(mg/60,0,1);
    const mSugar = sugar ? 0.85 : 1;
    const W = { na:0.45, k:0.15, mg:0.15, sugar:0.25 };
    const match = mNa*W.na + mK*W.k + mMg*W.mg + mSugar*W.sugar;
    const score = match*10;
    return {score, cost, match, ref:true, metrics:[], flags:[]};
  },
  intra_workout(p){
    const eaa = num(p["EAA dose per serving (grams)"]);
    const carb = num(p["Carb dose per serving (grams)"]);
    const carbSrc = String(p["Carb Source"]||"");
    const hyd = /yes/i.test(String(p["Hydration/Osmolytes"]||""));
    const cost = num(p["Price per True Serving (£)"]);
    const premiumCarb = /cluster|dextrin|hbcd|highly branched/i.test(carbSrc);
    const mEaa = clamp(eaa/14,0,1);
    const mCarb = clamp(carb/35,0,1) * (premiumCarb?1:0.7);
    const mHyd = hyd?1:0.3;
    const W = { eaa:0.50, carb:0.30, hyd:0.20 };
    const match = mEaa*W.eaa + mCarb*W.carb + mHyd*W.hyd;
    const score = match*10;
    return {score, cost, match, ref:true, metrics:[], flags:[]};
  },
  post_workout(p){
    const pro = num(p["Protein dose per serving (grams)"]);
    const carbs = num(p["Carb Source & Dose"]);
    const recovery = String(p["Added Recovery Agents"]||"");
    const recCount = recovery? recovery.split(/,| and /).filter(x=>x.trim()).length : 0;
    const cost = num(p["Price per True Serving (£)"]);
    const mPro=clamp(pro/40,0,1), mCarb=clamp(carbs/70,0,1), mRec=clamp(recCount/4,0,1);
    const W = { pro:0.45, carb:0.30, rec:0.25 };
    const match = mPro*W.pro + mCarb*W.carb + mRec*W.rec;
    const score = match*10;
    return {score, cost, match, ref:true, metrics:[], flags:[]};
  },
  protein_bars(p){
    const price   = num(p["Average UK Retail Price (£)"]);
    const protein = num(p["Protein per bar (grams)"]);
    const sugar   = num(p["Sugar per bar (grams)"]);
    const fat     = num(p["Fat per bar (grams)"]);
    const mProtein = protein>=15 ? 1 : clamp(protein/15,0,1);
    const mValue = price>0 ? clamp(2.00/price,0,1) : 0;
    const mSugar = sugar<=5 ? 1 : clamp(1-(sugar-5)/10,0,1);
    const mFat = fat<=10 ? 1 : clamp(1-(fat-10)/10,0,1);
    const W = { protein:0.50, value:0.25, sugar:0.15, fat:0.10 };
    const match = mProtein*W.protein + mValue*W.value + mSugar*W.sugar + mFat*W.fat;
    const score = match*10;
    return {score, cost:price, match, ref:false, metrics:[], flags:[]};
  },
  meal_replacement_rtd(p){
    const price   = num(p["Average UK Retail Price (£)"]);
    const protein = num(p["Protein per bottle (grams)"]);
    const fat     = num(p["Fat per bottle (grams)"]);
    const sat     = num(p["Saturated Fat per bottle (grams)"]);
    const sugar   = num(p["Sugar per bottle (grams)"]);
    const cal     = num(p["Calories per bottle"]);
    const micro   = num(p["Micronutrient Completeness"]);
    let mProtein;
    if (protein>=25) mProtein = 1;
    else if (protein>=20) mProtein = 0.8 + (protein-20)/5*0.2;
    else mProtein = clamp(protein/20*0.8,0,1);
    const ppg = protein>0 ? price/protein : Infinity;
    const mValue = isFinite(ppg) && ppg>0 ? clamp(0.15/ppg,0,1) : 0;
    const mMicro = clamp(micro/26,0,1);
    let mCal;
    if (cal>=200 && cal<=550) mCal = 1;
    else if (cal<200) mCal = clamp(cal/200,0,1);
    else mCal = clamp(1-(cal-550)/550,0,1);
    const mFatQual = fat>0 ? clamp((fat-sat)/fat,0,1) : 1;
    const mSugar = sugar<=8 ? 1 : clamp(1-(sugar-8)/16,0,1);
    const W = { protein:0.40, value:0.25, micro:0.10, cal:0.10, fat:0.10, sugar:0.05 };
    const match = mProtein*W.protein + mValue*W.value + mMicro*W.micro + mCal*W.cal + mFatQual*W.fat + mSugar*W.sugar;
    const score = match*10;
    return {score, cost: isFinite(ppg)?ppg:null, match, ref:false, metrics:[], flags:[]};
  },
  vitamins_wellbeing(p){
    const cost = num(p["Price per serving (£)"]) || null;
    const doseStr = p["Active Ingredient Dose per serving"] || '';
    const doseNum = parseFloat(doseStr.replace(/[^0-9.]/g,'')) || 0;
    const ingredient = (p["Key Active Ingredient"] || '').toLowerCase();
    const formText   = (p["Form/Quality Flag"] || '').toLowerCase();
    const mValue = cost>0 ? clamp(0.30/cost,0,1) : 0.5;
    let mDose = 0.5;
    if (doseNum > 0) {
      if (/vitamin d|vit d/.test(ingredient) || /\biu\b/.test(doseStr.toLowerCase())) {
        mDose = doseNum>=2000 && doseNum<=4000 ? 1 : doseNum>4000 ? clamp(1-(doseNum-4000)/4000,0.5,1) : clamp(doseNum/2000,0,1);
      } else if (/magnesium/.test(ingredient)) {
        const isChel = /glycinate|bisglycinate/.test(formText);
        const elemental = isChel ? doseNum*0.15 : doseNum;
        mDose = clamp(elemental/300,0,1);
      } else if (/ashwagandha/.test(ingredient)) {
        const isKSM = /ksm.66|ksm66/.test(formText);
        mDose = clamp(doseNum/300,0,1) * (isKSM ? 1 : 0.8);
      } else if (/\bb12\b|vitamin b.?12/.test(ingredient)) {
        mDose = clamp(doseNum/500,0,1);
      } else if (/\bzinc\b/.test(ingredient)) {
        mDose = doseNum<=30 ? clamp(doseNum/15,0,1) : clamp(1-(doseNum-30)/30,0.3,1);
      } else if (/omega|fish oil/.test(ingredient)) {
        mDose = clamp(doseNum/1000,0,1);
      } else if (/vitamin c|ascorbic/.test(ingredient)) {
        mDose = clamp(doseNum/500,0,1);
      } else if (/vitamin k2|k2/.test(ingredient)) {
        const isMK7 = /mk.7|mk7/.test(formText);
        mDose = isMK7 ? clamp(doseNum/100,0,1) : clamp(doseNum/500,0,1);
      } else if (/probiotic/.test(ingredient)) {
        mDose = clamp(doseNum/20,0,1);
      } else {
        mDose = 0.6;
      }
    }
    const HIGH_FORM = ['d3','cholecalciferol','ksm-66','ksm66','mk-7','mk7','methylcobalamin','glycinate','bisglycinate','picolinate','gluconate','sensoril','organic'];
    const LOW_FORM  = ['d2','ergocalciferol','oxide','cyanocobalamin'];
    const hCount = HIGH_FORM.filter(k=>formText.includes(k)).length;
    const lCount = LOW_FORM.filter(k=>formText.includes(k)).length;
    const mForm = lCount>0 ? 0.35 : hCount>0 ? clamp(0.7+hCount*0.1,0,1) : 0.55;
    const W = {value:0.35, dose:0.40, form:0.25};
    const match = mValue*W.value + mDose*W.dose + mForm*W.form;
    const score = match*10;
    return {score, cost, match, ref:false, metrics:[], flags:[]};
  },
  hormone_support(p){
    const cost      = num(p["Price per serving (£)"]) || null;
    const primary   = (p["Primary Active"] || '').toLowerCase();
    const doseNum   = num(p["Primary Active Dose per serving (mg)"] || 0);
    const propBlend = yes(p["Proprietary Blend"]);
    const secondaries = (p["Secondary Actives"] || '').toLowerCase();
    const mValue = cost>0 ? clamp(1.00/cost,0,1) : 0.5;
    let mDose = 0.5;
    if (doseNum > 0) {
      if (/d-aspartic acid|daa/.test(primary)) {
        mDose = clamp(doseNum/2000,0,1);
      } else if (/ashwagandha/.test(primary)) {
        mDose = clamp(doseNum/300,0,1);
      } else if (/tongkat ali|eurycoma/.test(primary)) {
        mDose = clamp(doseNum/200,0,1);
      } else if (/zinc/.test(primary)) {
        mDose = clamp(doseNum/15,0,1);
      } else if (/boron/.test(primary)) {
        mDose = clamp(doseNum/6,0,1);
      } else {
        mDose = 0.55;
      }
    }
    const mTransparency = propBlend ? 0.25 : 1;
    const knownActives = ['zinc','boron','vitamin d','ashwagandha','tongkat ali','fenugreek','magnesium'];
    const activeCount  = knownActives.filter(a=>secondaries.includes(a)).length;
    const formulaBonus = clamp(activeCount*0.05, 0, 0.15);
    const W = {value:0.35, dose:0.45, transparency:0.20};
    const baseMatch = mValue*W.value + mDose*W.dose + mTransparency*W.transparency;
    const match = clamp(baseMatch + formulaBonus, 0, 1);
    const score = match*10;
    return {score, cost, match, ref:false, metrics:[], flags:[]};
  },
  gut_digestion(p){
    const cost = num(p["Price per serving (£)"]) || null;
    const type = (p["Type"] || '').toLowerCase();
    const propBlend = yes(p["Proprietary Blend"]);
    let valueBench = 0.30;
    if (/probiotic|synbiotic/.test(type)) valueBench = 0.50;
    else if (/enzyme/.test(type))        valueBench = 0.30;
    else if (/fibre|prebiotic/.test(type)) valueBench = 0.15;
    else if (/vinegar|acv/.test(type))   valueBench = 0.25;
    const mValue = cost>0 ? clamp(valueBench/cost,0,1) : 0.5;
    let mEff = 0.5;
    if (/synbiotic/.test(type)) {
      const cfu = num(p["CFU (billion)"]), strains = num(p["Strain Count"]), fib = num(p["Fibre dose (g)"]);
      const mCfu = clamp(cfu/10,0,1), mStrain = clamp(strains/5,0,1), mFib = clamp(fib/3,0,1);
      const mProb = mCfu*0.6 + mStrain*0.4;
      mEff = mProb*0.6 + mFib*0.4;
    } else if (/probiotic/.test(type)) {
      const cfu = num(p["CFU (billion)"]), strains = num(p["Strain Count"]);
      const mCfu = clamp(cfu/10,0,1), mStrain = clamp(strains/5,0,1);
      mEff = mCfu*0.6 + mStrain*0.4;
      if (yes(p["Shelf Stable"])) mEff = clamp(mEff+0.05,0,1);
    } else if (/enzyme/.test(type)) {
      const ez = num(p["Enzyme Types"]);
      mEff = clamp(ez/4,0,1);
    } else if (/fibre|prebiotic/.test(type)) {
      const fib = num(p["Fibre dose (g)"]);
      const isPsyllium = /psyllium/i.test(p["Fibre Type"]||'');
      const target = isPsyllium ? 5 : 3;
      mEff = clamp(fib/target,0,1);
    } else if (/vinegar|acv/.test(type)) {
      const aa = num(p["Acetic Acid (mg)"]);
      mEff = clamp(aa/500,0,1);
    } else {
      mEff = 0.55;
    }
    const mTrans = propBlend ? 0.30 : 1;
    const W = { eff:0.65, value:0.25, trans:0.10 };
    const match = clamp(mEff*W.eff + mValue*W.value + mTrans*W.trans, 0, 1);
    const score = match*10;
    return {score, cost, match, ref:false, metrics:[], flags:[]};
  }
};

function wheyScore(p, idealYield){
  const yield_ = num(p["Protein Yield Percentage"]);
  const pro = num(p["Protein per serving (grams)"]);
  const price = num(p["Average UK Retail Price (£)"]);
  const servSize = num(p["Serving Size (grams)"])||30;
  const tub = num(p["Tub Size (grams)"]||p["Tub Size (grams/kg)"]);
  const servings = num(p["Total Servings"]) || (tub&&servSize? tub/servSize:0);
  const spiked = yes(p["Amino Spiked Flag"]||p["Amino Spiked Flag (Yes/No)"]);
  const costServ = num(p["Price per True Serving (£)"]) || (servings? price/servings : null);
  const costPer100 = (costServ&&pro)? costServ/pro*100 : null;
  const mPurity = clamp((yield_-60)/((idealYield||82)-60),0,1);
  const mClean  = 1;
  const mValue  = clamp((4.5-(costPer100??4.5))/3.0,0,1);
  const W = { purity:0.45, clean:0.35, value:0.20 };
  const match = mPurity*W.purity + mClean*W.clean + mValue*W.value;
  const spikePenalty = spiked ? 0.85 : 1;
  const score = match*10*spikePenalty;
  return {score, cost:costServ, match, ref:true, metrics:[], flags:[]};
}

const compress = (x)=> x<=8 ? x : 8 + (x-8)*0.65;
function scoreOf(k,p){ if(!SCORERS[k]) return {score:5,cost:null,match:0.5,ref:false,metrics:[],flags:[]}; const s = SCORERS[k](p); if(!s.ref) s.score = compress(s.score); return s; }
// ============================================================================

const scores = {}
let count = 0
for (const [k, group] of Object.entries(DADB)) {
  for (const p of group.products || []) {
    const name = p["Name"]
    const brand = p["Brand"] || ''
    if (!name) continue
    let s
    try { s = scoreOf(k, p) } catch { continue }
    const score100 = Math.round(clamp(s.score, 0, 10) * 10)
    scores[`${brand}|${name}`] = score100
    count++
  }
}

// ---- alias entries: DB products whose brand|name differs from the data.js key.
// These map a live-catalogue key onto an existing data.js score so scoreFor()
// resolves them. Maintained in scripts/score-aliases.json (auditable).
const aliasPath = path.join(__dirname, 'score-aliases.json')
if (fs.existsSync(aliasPath)) {
  const aliases = JSON.parse(fs.readFileSync(aliasPath, 'utf8'))
  let aliased = 0
  for (const [dbKey, dataKey] of Object.entries(aliases)) {
    if (dataKey in scores && !(dbKey in scores)) { scores[dbKey] = scores[dataKey]; aliased++ }
  }
  console.log(`Applied ${aliased} score aliases.`)
}

const header = `// AUTO-GENERATED by scripts/_build-scores.mjs — DO NOT EDIT BY HAND.
// Clinical scores (0-100) for Path A products, keyed by \`\${brand}|\${name}\`.
// Regenerate: node scripts/_build-scores.mjs
`
const body = `export const PRODUCT_SCORES: Record<string, number> = ${JSON.stringify(scores, null, 2)}\n\n` +
`export function scoreFor(brand: string | null | undefined, name: string | null | undefined): number | null {\n` +
`  if (!name) return null\n` +
`  const key = \`\${brand || ''}|\${name}\`\n` +
`  return key in PRODUCT_SCORES ? PRODUCT_SCORES[key] : null\n` +
`}\n`

fs.writeFileSync(path.join(ROOT, 'lib', 'scores.ts'), header + '\n' + body, 'utf8')
console.log(`Wrote lib/scores.ts with ${count} product scores.`)
