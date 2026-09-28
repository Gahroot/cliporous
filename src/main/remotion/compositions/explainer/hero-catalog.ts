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
