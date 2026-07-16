/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  badge: "Article" | "Guide" | "Review";
  readTime: string;
  seoTitle: string;
  description: string;
  heroAngle: string;
  highlights: string[];
  content: string;
  sourceUrl?: string;
  ctaText?: string;
}

export type SocialPlatform = "linkedin" | "instagram" | "short_video";

export type CreativeAngle = 
  | "category_reframe" 
  | "local_market" 
  | "objection_crusher" 
  | "storytelling" 
  | "team_motivation";

export interface CreativeAngleSpec {
  id: CreativeAngle;
  label: string;
  description: string;
  emoji: string;
}

export interface SocialTemplate {
  platform: SocialPlatform;
  angle: CreativeAngle;
  title: string;
  content: string;
  slides?: string[]; // Specifically for Instagram slide-by-slide Carousel
  videoDirectives?: string; // For Shorts/TikTok script
}

export interface BattlecardItem {
  id: string;
  category: "lead_generation" | "storm_response" | "report_claim" | "performance_commissions" | "onboarding";
  objection: string;
  counterWedge: string;
  discoveryQuestions: string[];
  oneLiner: string;
  metrics: { label: string; value: string }[];
}

export interface CalendarSlot {
  id: string;
  dayOfWeek: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  articleId?: string;
  platform: SocialPlatform;
  angle: CreativeAngle;
  postText: string;
  slides?: string[];
  videoDirectives?: string;
  timeOfDay: string;
  status: "draft" | "scheduled" | "published";
  notes?: string;
}
