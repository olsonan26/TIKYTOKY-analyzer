import type { GrowthPlan, Outcome, Video } from "./types";
import { latestSnapshot, rankVideos } from "./ranking";

const ZONE = "America/Denver";
const partsFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function parts(date: Date) {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map(x => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}
export function utahWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(candidate));
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    candidate = target - (represented - candidate);
  }
  return new Date(candidate);
}
function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function quantile(values: number[], q: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}
export function buildGrowthPlan(videos: Video[], outcomes: Outcome[], now = new Date()): GrowthPlan {
  const tiktok = videos.filter(v => v.platform === "tiktok");
  const pool = tiktok.length ? tiktok : videos;
  const known = rankVideos(pool).filter(v => v.duration !== null && v.duration >= 10 && v.duration <= 180 && (latestSnapshot(v)?.views ?? 0) > 0);
  const top = known.slice(0, Math.max(3, Math.ceil(known.length / 4)));
  const lengths = top.map(v => v.duration as number);
  const enoughLengths = lengths.length >= 3;
  const duration = enoughLengths ? {
    seconds: Math.round(median(lengths)), lower: Math.round(quantile(lengths, 0.25)), upper: Math.round(quantile(lengths, 0.75)), sampleSize: lengths.length,
    basis: `Observed durations in ${lengths.length} of the strongest ${tiktok.length ? "TikTok " : ""}videos in your research sample. This association does not establish an optimal length.`
  } : { seconds: 30, lower: 20, upper: 40, sampleSize: lengths.length, basis: "Experimental starting range. Fewer than three measured reference durations are available; this is not a measured optimum." };

  // Compare own posts at a similar observation age, never lifetime counts across differently aged posts.
  // Deduplicate the same public post across repeated manual entries.
  const byUrl = new Map<string, Outcome>();
  for (const outcome of outcomes) {
    const old = byUrl.get(outcome.url);
    if (old) byUrl.set(outcome.url, { ...outcome, snapshots: [...old.snapshots, ...outcome.snapshots] });
    else byUrl.set(outcome.url, outcome);
  }
  const observations: { hour: number; views: number }[] = [];
  for (const post of byUrl.values()) {
    const published = new Date(post.publishedAt);
    if (!Number.isFinite(+published) || +published > +now) continue;
    const comparable = post.snapshots.filter(s => {
      const age = (Date.parse(s.observedAt) - +published) / 3600000;
      return s.views !== null && age >= 23 && age <= 25 && Date.parse(s.observedAt) <= +now;
    }).toSorted((a, b) => Math.abs((Date.parse(a.observedAt) - +published) / 3600000 - 24) - Math.abs((Date.parse(b.observedAt) - +published) / 3600000 - 24))[0];
    if (comparable?.views !== null && comparable?.views !== undefined) observations.push({ hour: parts(published).hour, views: comparable.views });
  }
  const buckets = new Map<number, number[]>();
  for (const o of observations) { const group = buckets.get(o.hour) ?? []; group.push(o.views); buckets.set(o.hour, group); }
  const eligible = [...buckets.entries()].filter(([, views]) => views.length >= 3).map(([hour, views]) => ({ hour, count: views.length, medianViews: median(views) })).toSorted((a, b) => b.medianViews - a.medianViews);
  const observed = observations.length >= 12 && eligible.length >= 2;
  const slots = observed ? eligible.slice(0, 3).map(x => ({ hour: x.hour, minute: 0 })) : [{ hour: 12, minute: 30 }, { hour: 18, minute: 30 }, { hour: 20, minute: 30 }];
  const local = parts(now);
  const schedule: GrowthPlan["schedule"] = [];
  for (let day = 0; schedule.length < 7 && day < 10; day++) {
    const calendarDay = new Date(Date.UTC(local.year, local.month - 1, local.day + day, 12));
    let slot = slots[day % slots.length];
    let at = utahWallTimeToUtc(calendarDay.getUTCFullYear(), calendarDay.getUTCMonth() + 1, calendarDay.getUTCDate(), slot.hour, slot.minute);
    if (+at <= +now + 30 * 60000) {
      const future = slots.map(s => ({ s, at: utahWallTimeToUtc(calendarDay.getUTCFullYear(), calendarDay.getUTCMonth() + 1, calendarDay.getUTCDate(), s.hour, s.minute) })).find(s => +s.at > +now + 30 * 60000);
      if (!future) continue;
      slot = future.s; at = future.at;
    }
    schedule.push({
      utc: at.toISOString(),
      localLabel: new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(at),
      rationale: observed ? `Test a slot supported by your own comparable 23–25 hour observations. Continue rotating to test whether the pattern repeats.` : `Experimental ${slot.hour < 16 ? "midday" : slot.hour < 20 ? "early evening" : "evening"} window. Replace this hypothesis with your audience activity and measured results.`
    });
  }
  return {
    timezone: ZONE, generatedAt: now.toISOString(), timingBasis: observed ? "observed" : "experiment",
    timingExplanation: observed ? `Based on ${observations.length} unique own posts with observations 23–25 hours after publishing and at least three posts per eligible hour. Comparing median observed views suggests testing ${eligible[0].hour}:00 Utah time. Different topics and content quality can confound this association.` : `These rotating Utah-time windows are a test plan, not proven best posting times. Your ${observations.length} qualifying own posts do not yet provide at least 12 comparable observations across two hours with three posts each. Check TikTok Studio's viewer activity; your audience may live elsewhere.`,
    schedule, duration,
    experiments: [
      { title: "Test the opening", change: "Keep the lesson and main structure steady. Use a direct question in one original video and a clear promise backed by your knowledge in another.", measure: "Record your own early retention, average watch time and completion rate when TikTok Studio supplies them. Compare at the same time after publishing." },
      { title: "Test the duration", change: `Make a focused ${duration.lower}-second version and a fuller ${duration.upper}-second lesson from different examples of the same topic. Remove repeated setup.`,
        measure: "Compare watch-time fraction, shares per view and follows per view using your own available analytics. Different videos are an imperfect comparison." },
      { title: "Test posting windows", change: "Rotate the proposed windows while keeping topic, production effort and format as comparable as possible. Change one major variable per experiment.", measure: "Save actual snapshots around 24 and 48 hours. Log audience activity and any outside promotion; never manufacture a missing baseline." }
    ],
    checklist: [
      "Refresh the niche search and check the age and source of the references.",
      "Make the first frame readable and the opening promise specific to the intended audience.",
      "Support every factual statement with your uploaded knowledge; do not invent stories, studies or testimonials.",
      "Deliver the promised payoff without padding; use captions that match what is said.",
      "Use an honest caption and relevant subject words so the intended audience can understand the topic.",
      "Choose a clear next action and respond to genuine viewer questions with useful follow-up content.",
      "Review TikTok Studio's account/content eligibility and viewer activity if results change unexpectedly.",
      "Record real results at comparable ages, including missing metrics as unknown."
    ],
    caveats: [
      "No model, posting time or script guarantees virality or fame.",
      "Utah is the schedule's display time zone; audience location and activity matter more than the creator's physical location.",
      "Research covers a provider search sample, not every TikTok video. Patterns describe associations, not causes.",
      "Content suggestions based on your numerology or astrology knowledge represent that supplied material; citations do not independently establish scientific validity.",
      "This plan does not publish or schedule posts on TikTok automatically."
    ]
  };
}
