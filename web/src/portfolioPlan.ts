import type { Plan, Stat } from './portfolio';
import type { Call } from './portfolioInsights';

export const HORIZON_LABEL = { short: 'Short term', long: 'Long term', date: 'Until a date' } as const;
export const PURPOSE_LABEL = { growth: 'Grow my money', income: 'Earn dividends', quick: 'Quick profit', safe: 'Keep it safe' } as const;

export type PlanTone = 'up' | 'neu' | 'down';
export interface PlanStatus {
  label: string;            // short badge: "On track", "Book profit", "Time is up" ...
  tone: PlanTone;
  headline: string;
  tips: string[];
  heldDays: number | null;
  daysLeft: number | null;  // to the end date (or the one-year mark for a short-term plan); null when open-ended
  toTarget: number | null;  // 0..100+ share of the profit target reached
  toLoss: number | null;    // 0..100+ share of the loss limit used
}

const DAY = 86400000;
const days = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.now()) / DAY);
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Describes the plan in one line, e.g. "Long term · grow my money · aiming for +30%". */
export function planLine(p: Plan): string {
  const parts: string[] = [p.horizon === 'date' && p.until ? `Until ${new Date(p.until + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : HORIZON_LABEL[p.horizon]];
  if (p.purpose) parts.push(PURPOSE_LABEL[p.purpose].toLowerCase());
  if (p.target) parts.push(`aim +${p.target}%`);
  if (p.loss) parts.push(`rethink at −${p.loss}%`);
  return parts.join(' · ');
}

/**
 * Judges one holding against what the owner said they want from it. The market read (`call`) is only part of the answer:
 * the same dip is fine for a ten-year holder and a warning for someone who needs the money in a month.
 */
export function planStatus(s: Stat, plan: Plan, call?: Call): PlanStatus {
  const heldDays = s.since ? -days(s.since) : null;
  const gain = s.pnlPct;
  const tips: string[] = [];
  const up = s.trend === 'Uptrend', down = s.trend === 'Downtrend';
  const stretched = (s.rsi ?? 0) >= 70 || (s.ext50 ?? 0) > 20;
  const sell = call?.signal === 'SELL' || call?.signal === 'BOOK';

  let daysLeft: number | null = null;
  if (plan.horizon === 'date' && plan.until) daysLeft = days(plan.until);
  else if (plan.horizon === 'short' && heldDays !== null) daysLeft = 365 - heldDays;

  const toTarget = plan.target && gain > 0 ? (gain / plan.target) * 100 : plan.target ? 0 : null;
  const toLoss = plan.loss && gain < 0 ? (-gain / plan.loss) * 100 : plan.loss ? 0 : null;

  let label = 'On track', tone: PlanTone = 'up', headline = '';

  if (plan.loss && gain <= -plan.loss) {
    label = 'Loss limit hit'; tone = 'down';
    headline = `It is down ${Math.abs(gain).toFixed(1)}%, past the −${plan.loss}% you said you would rethink at.`;
    tips.push(down ? 'The chart is also weak. Cutting the loss is reasonable; waiting to break even often takes years.' : 'The chart has not broken down, so decide whether your reason for buying still holds. If it does, you can hold; if not, exit.');
  } else if (plan.target && gain >= plan.target) {
    label = 'Target reached'; tone = 'neu';
    headline = `Up ${gain.toFixed(1)}%, past your +${plan.target}% goal.`;
    tips.push(plan.horizon === 'long' && up && !stretched ? 'The trend is still up, so you could book half the profit and let the rest run.' : 'This is the moment you planned for. Consider booking the profit, all or in two parts.');
  } else if (plan.horizon === 'date' && daysLeft !== null && daysLeft < 0) {
    label = 'Date passed'; tone = 'neu';
    headline = `Your date was ${-daysLeft} day${daysLeft === -1 ? '' : 's'} ago.`;
    tips.push(gain > 0 ? 'You are in profit. Book it, or set a new date if you want to stay in.' : 'You are at a loss. Pick a new date, or decide whether to exit and move on.');
  } else if (plan.horizon === 'date' && daysLeft !== null && daysLeft <= 30) {
    label = gain > 0 ? 'Book profit soon' : 'Date is near'; tone = 'neu';
    headline = `${daysLeft} day${daysLeft === 1 ? '' : 's'} left until your date.`;
    tips.push(gain > 0 ? 'Plan the profit booking now rather than on the last day, so a sudden dip does not catch you.' : 'You are at a loss with little time left. Decide whether to extend your date or exit.');
  } else if (plan.horizon === 'short' && down && gain < 0) {
    label = 'Watch closely'; tone = 'down';
    headline = 'Short-term plan, but the trend is down and you are in a loss.';
    tips.push('There is little time to recover. Set a firm exit price now, or move to a longer plan only if you truly can wait.');
  } else if (plan.horizon === 'short' && gain > 0 && (stretched || sell)) {
    label = 'Book profit'; tone = 'neu';
    headline = 'Short-term gain, and the price looks stretched.';
    tips.push('Short-term holders usually do best by booking gains when a run looks tired.');
  } else if (plan.horizon === 'long' && down && gain < -15 && s.verdict === 'poor') {
    label = 'Review'; tone = 'down';
    headline = 'Long-term plan, but the stock is deeply down and lagging the market.';
    tips.push('Time can heal a good business but not a weak one. Check the company\'s results and news before holding on.');
  } else if (plan.horizon === 'long' && gain < 0 && !down) {
    label = 'Patient'; tone = 'up';
    headline = 'Down for now, but the trend is intact and you have time.';
  } else if (plan.horizon === 'long' && up && s.verdict !== 'poor') {
    label = 'On track'; tone = 'up';
    headline = 'In an uptrend and beating its goal path. Long-term holders are rewarded for staying put.';
  } else if (s.verdict === 'poor') {
    label = 'Watch closely'; tone = 'down';
    headline = 'Lagging the market. Keep a close eye on it.';
  } else {
    headline = down ? 'The trend is down for now; nothing forces you to act yet.' : 'Nothing needs your attention.';
    if (down) { label = 'Watch'; tone = 'neu'; }
  }

  // extra, plan-specific guidance
  if (plan.horizon === 'short' && daysLeft !== null && daysLeft > 0 && daysLeft <= 45) tips.push(`${daysLeft} days to the one-year mark. In India, shares held longer than a year are taxed at a lower long-term rate, so waiting may be worth it if you are in profit.`);
  if (plan.horizon === 'long' && heldDays !== null && heldDays < 365 && gain > 0) tips.push(`Held ${heldDays} days. Past 365 days, gains on Indian shares are taxed at the lower long-term rate.`);
  if (plan.purpose === 'income' && !s.isFund) tips.push('You want dividend income: look at the dividend yield and whether the company has paid it steadily in the past.');
  if (plan.purpose === 'safe' && !s.debt && s.weight > 20) tips.push('You said you want to keep this safe, yet a single stock is a big part of your money. A debt fund or index fund suits that goal better.');
  if (plan.purpose === 'quick' && plan.horizon === 'long') tips.push('You picked quick profit but a long horizon. Decide which one you really want, as they call for different choices.');
  if (plan.calm === 'panic' && s.weight > 15 && !s.debt) tips.push('A 20% fall would worry you, and this is a large share of your money. Consider holding less of it so a dip does not force a bad sale.');
  if (plan.calm === 'calm' && gain < 0 && gain > -10 && !down) tips.push('You said a fall would not bother you. A small dip in a healthy trend can be a chance to add a little.');
  if (plan.target && toTarget !== null && toTarget >= 60 && toTarget < 100) tips.push(`You are ${toTarget.toFixed(0)}% of the way to your profit goal.`);
  if (!tips.length && call) tips.push(call.why);

  return { label, tone, headline, tips, heldDays, daysLeft, toTarget, toLoss };
}
