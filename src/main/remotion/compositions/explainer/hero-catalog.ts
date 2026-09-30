/**
 * Hero prop catalog — pure data shared by the planner (prompt hints, transcript
 * triggers, sound cues) and the renderer (impact timing). No React/three here
 * so the main-process planner can import it.
 *
 * Every prop has ONE signature motion with an "impact" moment `impactSec`
 * after its appear beat; the renderer bursts + pushes the camera there and the
 * planner places `impactCue` on it. Keep a prop's animation in sync with its
 * `impactSec` (and `downImpactSec` for the reversed tone).
 */

import type { HeroProp, SceneCueKind } from './types';

export const KINETIC_TIMING = {
  flywheel: 0.95,
  lever: 1.35,
  pulley: 1.35,
  spring: 1.5,
  ratchet: 1.8,
} as const;

export const TRANSPORT_TIMING = {
  conveyor: 1.4,
  valve: 0.9,
  'pressure-gauge': 1.25,
  'rail-switch': 0.65,
} as const;

export const STORAGE_TIMING = {
  parcel: 1.5,
  'filing-cabinet': 1.1,
  reservoir: 1.3,
} as const;

export const STRUCTURE_TIMING = {
  bridge: 1.2,
  arch: 1.3,
} as const;

export const OPTICS_TIMING = {
  prism: 1.1,
  aperture: 1.1,
  'magnifying-glass': 1.15,
  telescope: 1.25,
} as const;

export const COMMERCE_TIMING = {
  vault: 0.65,
  wallet: 0.95,
  'card-reader': 0.85,
  calculator: 1.2,
} as const;

export const MEDIA_TIMING = {
  microphone: 0.8,
  camera: 0.98,
  clapperboard: 0.9,
} as const;

export const TOOLS_TIMING = {
  metronome: 0.8,
  'watering-can': 0.97,
  wrench: 0.7,
} as const;

const CAUSAL_HERO_TIMING = {
  ...KINETIC_TIMING,
  ...TRANSPORT_TIMING,
  ...STORAGE_TIMING,
  ...STRUCTURE_TIMING,
  ...OPTICS_TIMING,
  ...COMMERCE_TIMING,
  ...MEDIA_TIMING,
  ...TOOLS_TIMING,
} satisfies Partial<Record<HeroProp, number>>;

/** Authored mechanisms own their motion; do not add legacy ambient turns or camera drift. */
export function isCausalHeroProp(prop: HeroProp): boolean {
  return Object.hasOwn(CAUSAL_HERO_TIMING, prop);
}

export interface HeroPropInfo {
  /** Short trigger meanings for the prompt ("idea, insight"). */
  hint: string;
  /** Transcript cues that make this prop worth offering (lowercase words). */
  triggers: RegExp;
  /** Seconds after `at` of the signature impact. */
  impactSec: number;
  /** Sound on the impact (omitted = only the appear whoosh). */
  impactCue?: { kind: SceneCueKind; gain: number };
  /** Props with a reversed action ('down' tone) and its impact time. */
  downImpactSec?: number;
  /** What the 'down' tone means, for the prompt ("drains"). */
  downHint?: string;
}

export const HERO_CATALOG: Readonly<Record<HeroProp, HeroPropInfo>> = {
  microphone: {
    hint: 'a studio microphone switches on before a restrained voice waveform; down mutes it',
    triggers:
      /\b(microphones?|podcast|record (?:your |the |a )?voice|mute (?:your |the )?mic|unmute)\b/,
    impactSec: MEDIA_TIMING.microphone,
    downImpactSec: MEDIA_TIMING.microphone,
    downHint: 'switches off and silences the waveform (mute)',
  },
  camera: {
    hint: 'a camera lens focuses before the shutter closes and reopens for one exposure',
    triggers:
      /\b(cameras?|photograph(?:s|y)?|take (?:a |the )?(?:photo|picture)|shutter|photographic exposure)\b/,
    impactSec: MEDIA_TIMING.camera,
    impactCue: { kind: 'tick', gain: 0.3 },
  },
  clapperboard: {
    hint: 'a hinged film slate closes once, with contact at the clap rather than an ambient bounce',
    triggers:
      /\b(clapperboard|film slate|slate the take|start (?:the |a )?take|lights camera action)\b/,
    impactSec: MEDIA_TIMING.clapperboard,
    impactCue: { kind: 'tick', gain: 0.4 },
  },
  metronome: {
    hint: 'a mechanical metronome establishes a measured rhythm, then comes to rest',
    triggers:
      /\b(metronome|steady (?:beat|rhythm|tempo)|keep (?:the |a )?(?:beat|tempo)|(?:play|playing|tick|ticking) in time)\b/,
    impactSec: TOOLS_TIMING.metronome,
    impactCue: { kind: 'tick', gain: 0.25 },
  },
  'watering-can': {
    hint: 'a watering can tilts, pours into a soil-filled pot, then rights itself; soil wets only after contact',
    triggers:
      /\b(watering can|water (?:the |your |a )?(?:plant|seedling|garden)|nurture (?:the |your |a )?(?:plant|seedling)|tend (?:the |your )?garden)\b/,
    impactSec: TOOLS_TIMING['watering-can'],
  },
  wrench: {
    hint: 'an open-ended wrench engages a hex nut before tightening the joint; down loosens it',
    triggers:
      /\b(wrench|spanner|tighten (?:the |a )?(?:nut|bolt|joint)|loosen (?:the |a )?(?:nut|bolt)|turn (?:the |a )?nut)\b/,
    impactSec: TOOLS_TIMING.wrench,
    downImpactSec: TOOLS_TIMING.wrench,
    downHint: 'engages before turning the nut the other way and loosening the joint',
    impactCue: { kind: 'tick', gain: 0.35 },
  },
  bridge: {
    hint: 'two hinged bridge leaves lower until their tips meet exactly, connecting both sides',
    triggers: /\b(bridges?|bridging the gap|connect(?:s|ed|ing)? both sides)\b/,
    impactSec: STRUCTURE_TIMING.bridge,
    impactCue: { kind: 'thump', gain: 0.4 },
  },
  arch: {
    hint: 'six side wedge blocks seat in pairs before the center keystone seats',
    triggers: /\b(arch(?:es|ways?)?|keystones?|cent(?:er|re) stone)\b/,
    impactSec: STRUCTURE_TIMING.arch,
    impactCue: { kind: 'thump', gain: 0.45 },
  },
  prism: {
    hint: 'a triangular prism separates one incoming beam into palette-colored branches',
    triggers:
      /\b(prism|refract(?:s|ed|ing|ion)?|split(?:s|ting)? (?:one |a |the )?(?:beam|light))\b/,
    impactSec: OPTICS_TIMING.prism,
  },
  aperture: {
    hint: 'overlapping iris blades narrow a lens opening together',
    triggers:
      /\b(aperture|iris (?:opens?|closes?|blades?)|narrow (?:the )?opening|let less light in)\b/,
    impactSec: OPTICS_TIMING.aperture,
    impactCue: { kind: 'tick', gain: 0.25 },
  },
  'magnifying-glass': {
    hint: 'a magnifying glass aligns with one authored detail and enlarges that exact detail',
    triggers:
      /\b(magnifying glass|magnify|magnification|look closer|inspect (?:the |a )?(?:fine print|small detail)|small print)\b/,
    impactSec: OPTICS_TIMING['magnifying-glass'],
  },
  telescope: {
    hint: 'nested telescope sections extend before the instrument aims toward a distant view',
    triggers:
      /\b(telescope|spyglass|distant (?:horizon|star|planet)|long[- ]range vision|see farther)\b/,
    impactSec: OPTICS_TIMING.telescope,
    impactCue: { kind: 'slide', gain: 0.3 },
  },
  parcel: {
    hint: 'flat parcel panels fold into a closed package with an attached lid',
    triggers:
      /\b(parcel|shipping box|pack (?:the |a |your )?(?:order|package)|package (?:the |your )?result)\b/,
    impactSec: STORAGE_TIMING.parcel,
    impactCue: { kind: 'tick', gain: 0.35 },
  },
  'filing-cabinet': {
    hint: 'a drawer opens before papers enter, then closes with them inside',
    triggers:
      /\b(filing cabinet|file (?:the |these |your )?(?:papers|documents)|organize (?:the |your )?records)\b/,
    impactSec: STORAGE_TIMING['filing-cabinet'],
    impactCue: { kind: 'slide', gain: 0.3 },
  },
  reservoir: {
    hint: 'a visible resource reserve fills through its inlet; down drains through its outlet',
    triggers:
      /\b(reservoir|resource reserve|buffer tank|fill (?:the |a )?tank|drain (?:the |a )?tank)\b/,
    impactSec: STORAGE_TIMING.reservoir,
    downImpactSec: STORAGE_TIMING.reservoir,
    downHint: 'drains the visible reserve through its outlet',
    impactCue: { kind: 'slide', gain: 0.25 },
  },
  vault: {
    hint: 'vault bolts release before the heavy door opens',
    triggers: /\b(vault|unlock the safe|open the safe|secured reserves)\b/,
    impactSec: COMMERCE_TIMING.vault,
    impactCue: { kind: 'tick', gain: 0.4 },
  },
  wallet: {
    hint: 'a bifold wallet opens to reveal its card compartment, not a promised return',
    triggers: /\b(wallet|personal spending|everyday spending|keep your cards)\b/,
    impactSec: COMMERCE_TIMING.wallet,
    impactCue: { kind: 'slide', gain: 0.3 },
  },
  'card-reader': {
    hint: 'a contactless card taps the reader before confirmation',
    triggers:
      /\b(card reader|contactless (?:payment|reader|card|terminal)|tap (?:your |the )?card|payment terminal)\b/,
    impactSec: COMMERCE_TIMING['card-reader'],
    impactCue: { kind: 'tick', gain: 0.35 },
  },
  calculator: {
    hint: 'calculator keys precede the resolved operation, without an invented amount',
    triggers:
      /\b(calculator|calculate (?:the |your )?(?:cost|total)|add up (?:the )?costs|do the math)\b/,
    impactSec: COMMERCE_TIMING.calculator,
    impactCue: { kind: 'tick', gain: 0.3 },
  },
  conveyor: {
    hint: 'a conveyor belt carries work along a production line',
    triggers: /\b(conveyor|production line|assembly line|belt carries)\b/,
    impactSec: TRANSPORT_TIMING.conveyor,
  },
  valve: {
    hint: 'turn a valve to control flow through a pipe',
    triggers: /\b(valve|control the flow|shut off the flow|throttle flow)\b/,
    impactSec: TRANSPORT_TIMING.valve,
    impactCue: { kind: 'tick', gain: 0.35 },
  },
  'pressure-gauge': {
    hint: 'a pressure gauge responds to input, without invented units',
    triggers: /\b(pressure gauge|gauge reading|gauge responds|needle rises)\b/,
    impactSec: TRANSPORT_TIMING['pressure-gauge'],
  },
  'rail-switch': {
    hint: 'seat a rail switch before committing to a route',
    triggers: /\b(rail switch|switch tracks|selects? the (?:right|left) track|railway junction)\b/,
    impactSec: TRANSPORT_TIMING['rail-switch'],
    impactCue: { kind: 'tick', gain: 0.35 },
  },
  flywheel: {
    hint: 'small repeated pushes build momentum, then coast',
    triggers: /\b(flywheel|build(?:s|ing)? momentum|keep(?:s)? turning)\b/,
    impactSec: KINETIC_TIMING.flywheel,
    impactCue: { kind: 'tick', gain: 0.35 },
  },
  lever: {
    hint: 'shift the fulcrum, change leverage, lift a load',
    triggers: /\b(lever|leverage|fulcrum|mechanical advantage)\b/,
    impactSec: KINETIC_TIMING.lever,
    impactCue: { kind: 'thump', gain: 0.35 },
  },
  pulley: {
    hint: 'taut cable turns a pulley and raises a load',
    triggers: /\b(pulley|taut cable|raise the load|hoist)\b/,
    impactSec: KINETIC_TIMING.pulley,
  },
  spring: {
    hint: 'compress a spring, store tension, then release',
    triggers:
      /\b(compress(?:ed)? (?:the |a )?spring|coiled spring|store(?:d)? tension|spring tension)\b/,
    impactSec: KINETIC_TIMING.spring,
    impactCue: { kind: 'pop', gain: 0.3 },
  },
  ratchet: {
    hint: 'advance through detents without slipping backwards',
    triggers: /\b(ratchet|detent|advance(?:s)? one notch|never slips backwards)\b/,
    impactSec: KINETIC_TIMING.ratchet,
    impactCue: { kind: 'tick', gain: 0.4 },
  },
  lightbulb: {
    hint: 'idea, insight, realise',
    triggers: /\b(idea|ideas|insight|realis|realiz|lightbulb|creativ|brainstorm|eureka)\w*/,
    impactSec: 0.2,
  },
  rocket: {
    hint: 'launch, take off, scale fast',
    triggers: /\b(launch|rocket|take off|skyrocket|blast|scale|shipped|ship it)\w*/,
    impactSec: 0.2,
  },
  coins: {
    hint: 'money, price, revenue',
    triggers: /\b(money|price|pric|cost|revenue|cash|dollar|pay|paid|profit|income|salary)\w*/,
    impactSec: 0.75,
    impactCue: { kind: 'pop', gain: 0.8 },
  },
  phone: {
    hint: 'app, call, text, social',
    triggers: /\b(phone|app|apps|call|calls|text|texts|dm|instagram|tiktok|mobile|scroll)\w*/,
    impactSec: 0.2,
  },
  laptop: {
    hint: 'software, work, computer',
    triggers: /\b(laptop|computer|software|website|code|coding|online|remote|email)\w*/,
    impactSec: 0.2,
  },
  lock: {
    hint: 'security, privacy, locked in (down = unlock, open up)',
    triggers: /\b(lock|locked|secur|privacy|private|safe|protect|password|unlock)\w*/,
    impactSec: 0.5,
    impactCue: { kind: 'thump', gain: 0.5 },
    downImpactSec: 0.5,
    downHint: 'springs open (unlock)',
  },
  target: {
    hint: 'goal, aim, bullseye, niche',
    triggers: /\b(goal|goals|target|aim|bullseye|niche|focus|precise|nail)\w*/,
    impactSec: 0.55,
    impactCue: { kind: 'thump', gain: 0.55 },
  },
  piggybank: {
    hint: 'save, savings, budget',
    triggers: /\b(sav(e|ing|ings)|piggy|budget|emergency fund|frugal|put away)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'pop', gain: 0.7 },
  },
  trophy: {
    hint: 'win, best, champion, award',
    triggers: /\b(win|wins|winning|won|winner|trophy|champion|award|best|first place)\w*/,
    impactSec: 0.35,
    impactCue: { kind: 'rise', gain: 0.5 },
  },
  briefcase: {
    hint: 'job, career, business, hire',
    triggers: /\b(job|jobs|career|business|hire|hired|hiring|office|corporate|boss)\w*/,
    impactSec: 0.5,
    impactCue: { kind: 'tick', gain: 0.8 },
  },
  megaphone: {
    hint: 'marketing, announce, audience, voice',
    triggers: /\b(market|marketing|announc|advertis|ads|audience|brand|promot|shout|voice)\w*/,
    impactSec: 0.3,
    impactCue: { kind: 'whoosh', gain: 0.5 },
  },
  magnet: {
    hint: 'attract clients, pull, leads',
    triggers: /\b(attract|magnet|pull|draw in|leads|inbound|clients come)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'tick', gain: 0.8 },
  },
  gift: {
    hint: 'bonus, free, give, surprise',
    triggers: /\b(gift|bonus|free|give|giving|giveaway|surprise|present|reward)\w*/,
    impactSec: 0.5,
    impactCue: { kind: 'pop', gain: 0.75 },
  },
  hourglass: {
    hint: 'patience, time running out, deadline',
    triggers: /\b(patien|hourglass|time is running|running out|deadline|wait|waiting|years)\w*/,
    impactSec: 0.45,
    impactCue: { kind: 'flip', gain: 0.6 },
  },
  stopwatch: {
    hint: 'fast, speed, minutes, efficiency',
    triggers: /\b(fast|faster|speed|quick|minutes|seconds|stopwatch|timer|efficien)\w*/,
    impactSec: 0.3,
    impactCue: { kind: 'tick', gain: 0.85 },
  },
  calendar: {
    hint: 'every day, schedule, date, routine',
    triggers: /\b(every day|daily|calendar|schedule|routine|monday|week|weekly)\w*/,
    impactSec: 0.5,
    impactCue: { kind: 'flip', gain: 0.6 },
  },
  brain: {
    hint: 'mindset, think, psychology, learn',
    triggers: /\b(brain|mind|mindset|think|thinking|psycholog|learn|smart|mental|memory)\w*/,
    impactSec: 0.35,
  },
  heart: {
    hint: 'love, health, passion, care',
    triggers: /\b(love|heart|health|healthy|passion|care|caring|relationship)\w*/,
    impactSec: 0.35,
    impactCue: { kind: 'thump', gain: 0.35 },
  },
  battery: {
    hint: 'energy, recharge (down = burnout, drained)',
    triggers: /\b(energy|battery|recharg|burnout|burn out|burned out|drain|tired|exhaust)\w*/,
    impactSec: 0.9,
    impactCue: { kind: 'pop', gain: 0.6 },
    downImpactSec: 0.9,
    downHint: 'drains to empty (burnout)',
  },
  flame: {
    hint: 'passion, hot, on fire, motivation',
    triggers: /\b(fire|flame|hot|burn|passion|motivat|hype|trending|heat)\w*/,
    impactSec: 0.25,
  },
  sprout: {
    hint: 'growth, start small, compound, nurture',
    triggers: /\b(grow|growth|growing|seed|plant|sprout|nurture|start small|organic)\w*/,
    impactSec: 0.7,
    impactCue: { kind: 'rise', gain: 0.45 },
  },
  mountain: {
    hint: 'challenge, summit, climb, big goal',
    triggers: /\b(mountain|summit|climb|peak|challenge|obstacle|everest|uphill)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'thump', gain: 0.5 },
  },
  dice: {
    hint: 'risk, luck, chance, gamble',
    triggers: /\b(risk|risky|luck|lucky|chance|gamble|odds|bet|random)\w*/,
    impactSec: 0.7,
    impactCue: { kind: 'thump', gain: 0.45 },
  },
  puzzle: {
    hint: 'missing piece, fit, solve',
    triggers: /\b(puzzle|piece|missing|fit|fits|solve|solution|figure out|clicks)\w*/,
    impactSec: 0.55,
    impactCue: { kind: 'tick', gain: 0.9 },
  },
  gears: {
    hint: 'system, process, machine, automation',
    triggers: /\b(system|systems|process|machine|automat|workflow|engine|mechanism|operat)\w*/,
    impactSec: 0.3,
  },
  key: {
    hint: 'the key is, unlock, secret, access',
    triggers: /\b(key|keys|secret|unlock|access|the answer|crack)\w*/,
    impactSec: 0.55,
    impactCue: { kind: 'tick', gain: 0.9 },
  },
  door: {
    hint: 'opportunity, open doors, new chapter',
    triggers: /\b(door|doors|opportunit|open up|opens up|new chapter)\w*/,
    impactSec: 0.45,
    impactCue: { kind: 'slide', gain: 0.6 },
  },
  chip: {
    hint: 'AI, tech, chip, compute',
    triggers: /\b(ai|a\.i\.|artificial|chatgpt|gpt|chip|tech|technology|algorithm|compute)\b/,
    impactSec: 0.35,
  },
  globe: {
    hint: 'world, global, travel, international',
    triggers:
      /\b(world|global|globe|travel|international|country|countries|worldwide|everywhere)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'pop', gain: 0.6 },
  },
  envelope: {
    hint: 'email, message, letter, newsletter',
    triggers: /\b(email|emails|mail|letter|newsletter|inbox|message|invite)\w*/,
    impactSec: 0.5,
    impactCue: { kind: 'slide', gain: 0.55 },
  },
  book: {
    hint: 'read, book, study, knowledge',
    triggers: /\b(book|books|read|reading|study|studied|knowledge|chapter|author|library)\w*/,
    impactSec: 0.45,
    impactCue: { kind: 'flip', gain: 0.6 },
  },
  shield: {
    hint: 'protection, privacy, secure — shield with a check settling onto its face',
    triggers: /\b(protect|privacy|secure|security|defen[cs]|safeguard|shield)\w*/,
    impactSec: 0.55,
    impactCue: { kind: 'pop', gain: 0.5 },
  },
  cloud: {
    hint: 'cloud storage, upload, backup — arrow lifts into cloud; down = download',
    triggers: /\b(cloud|upload|download|backup|hosting|sync)\w*/,
    impactSec: 0.55,
    downImpactSec: 0.55,
    downHint: 'arrow points down for download',
    impactCue: { kind: 'slide', gain: 0.5 },
  },
  checkmark: {
    hint: 'approved, verified, completed — a beveled check swings into place',
    triggers:
      /\b(approv(?:e|ed|al|ing)|verif(?:y|ied|ication)|complet(?:e|ed|ion|ing)|checkmark|confirm(?:ed|ation)?|done|correct)\b/,
    impactSec: 0.45,
    impactCue: { kind: 'pop', gain: 0.5 },
  },
  warning: {
    hint: 'warning, risk, caution — triangle with a short recoil, not a flashing alert',
    triggers: /\b(warning|risk|caution|danger|alert|hazard)\w*/,
    impactSec: 0.5,
    impactCue: { kind: 'thump', gain: 0.5 },
  },
  lightning: {
    hint: 'speed, instant, electricity — bolt with a short impact recoil',
    triggers: /\b(lightning|instant|electric|voltage|speed|rapid)\w*/,
    impactSec: 0.4,
    impactCue: { kind: 'pop', gain: 0.5 },
  },
  chat: {
    hint: 'conversation, feedback, support — three dots reply in sequence',
    triggers: /\b(chat|conversation|feedback|support|reply|dialogue|discuss)\w*/,
    impactSec: 0.65,
    impactCue: { kind: 'pop', gain: 0.45 },
  },
  crown: {
    hint: 'leadership, premium, champion — crown seats with weighted follow-through',
    triggers: /\b(crown|leader|premium|champion|royal|king|queen)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'thump', gain: 0.5 },
  },
  diamond: {
    hint: 'value, rare, quality — beveled gem turns to reveal contrasting facets',
    triggers: /\b(diamond|gem|rare|valuable|quality|precious)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'pop', gain: 0.5 },
  },
  bookmark: {
    hint: 'save, remember, reference — saved ribbon with inset lines',
    triggers: /\b(bookmark|save|saved|remember|reference|reading list)\b/,
    impactSec: 0.5,
    impactCue: { kind: 'slide', gain: 0.45 },
  },
  compass: {
    hint: 'direction, navigation, purpose — needle finds its heading',
    triggers: /\b(compass|direction|navigat|purpose|heading|orient)\w*/,
    impactSec: 0.7,
    impactCue: { kind: 'pop', gain: 0.5 },
  },
  link: {
    hint: 'connection, integration, partnership — two beveled links join',
    triggers: /\b(link|connect|integrat|partner|relationship|bond)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'pop', gain: 0.5 },
  },
  'graduation-cap': {
    hint: 'education, graduation, qualification — cap seats, tassel follows',
    triggers: /\b(graduat|educat|qualification|degree|university|college|diploma)\w*/,
    impactSec: 0.6,
    impactCue: { kind: 'thump', gain: 0.5 },
  },
};

/** Seconds after `at` of the prop's impact beat for the given tone. */
export function heroImpactSec(prop: HeroProp, tone?: 'up' | 'down'): number {
  const info = HERO_CATALOG[prop];
  return tone === 'down' && info.downImpactSec !== undefined ? info.downImpactSec : info.impactSec;
}

/** Whether a prop has a reversed ('down') action. */
export function heroHasDownTone(prop: HeroProp): boolean {
  return HERO_CATALOG[prop].downImpactSec !== undefined;
}
