import { CreativeAngleSpec, BattlecardItem, SocialTemplate } from "../types";

export const creativeAngles: CreativeAngleSpec[] = [
  {
    id: "category_reframe",
    label: "Category Reframe",
    description: "Pivot the discussion from standard lead generation to complete operational roof-file control.",
    emoji: "🔄"
  },
  {
    id: "local_market",
    label: "Local-Market Sharpness",
    description: "Speak with authority directly to Texas storm, DFW, and hail-restoration contractors.",
    emoji: "🎯"
  },
  {
    id: "objection_crusher",
    label: "Objection Crusher",
    description: "Overcomplicate generic digital campaigns, highlighting why doorstep trust and physical proof close deals.",
    emoji: "🛡️"
  },
  {
    id: "storytelling",
    label: "Storytelling Mode",
    description: "A narrative approach tracking a rep's flow from notebook chaos to digital field command.",
    emoji: "📖"
  },
  {
    id: "team_motivation",
    label: "Team Motivation",
    description: "Focus on gamified visibility, transparent commissions, and high adoption rates to reduce rep turnover.",
    emoji: "⚡"
  }
];

export const battlecards: BattlecardItem[] = [
  {
    id: "ai_sdr",
    category: "lead_generation",
    objection: "Roof Flow AI has a 24/7 AI SDR that responds to leads in 60 seconds and books appointments.",
    counterWedge: "Fast follow-up is excellent, but if your field operation is disconnected, you are just booking empty walkthroughs. Booking the inspection is not the finish line. Acme centers on the entire roof file: storm layers, damage analysis, measurements, instant reports, signatures, and team payouts. We ensure your reps turn those booked inspection slots into documented revenue.",
    discoveryQuestions: [
      "After the AI books the inspection, what happens to the shingle photos, roof pitch numbers, and adjustor notes?",
      "Do your field reps have to manually transfer client info into multiple separate reporting tools in their truck?"
    ],
    oneLiner: "Roof Flow AI books the inspection appointment. Acme helps your team win everything after the storm.",
    metrics: [
      { label: "Win-rate with reports", value: "+30%" },
      { label: "Admin time saved", value: "4.5 hrs/week" }
    ]
  },
  {
    id: "ads_autopilot",
    category: "storm_response",
    objection: "They have referrals on autopilot and a built-in AI Facebook ad launcher.",
    counterWedge: "Generic digital leads are getting more expensive. A single roofing lead can cost $82, and PPC ads face severe click exhaustion. Roofers don't grow by throwing money at Google/Facebook algorithms. They grow by targeting storm zones. Acme combines live HailTrace storm metrics and interactive maps so you place your reps directly on streets with documented damage shingle details.",
    discoveryQuestions: [
      "What is your actual customer acquisition cost (CAC) on digital Facebook ads currently?",
      "How do your reps currently coordinate routes in a fresh storm district to prevent double knocks?"
    ],
    oneLiner: "Search ads scale expensive views, but hyper-local storm intelligence secures high-margin roof contracts.",
    metrics: [
      { label: "Cost-Per-Lead reduction", value: "-45%" },
      { label: "Hail mapping accuracy", value: "100%" }
    ]
  },
  {
    id: "onboarding_speed",
    category: "onboarding",
    objection: "Roof Flow AI offers done-for-you options where they set up your settings entirely.",
    counterWedge: "DFY sounds appealing, but waiting on support queues to change your commission structure, adjust report values, or onboard a new rookie is frustrating. Acme offers intuitive same-day onboarding and direct workflow controls. You are in complete control of your estimates, reports, and zones from minute one.",
    discoveryQuestions: [
      "If you need to change your pricing list, add contract terms, or adjust a commission model today, how long do you have to wait on support?",
      "Can your team roll out a fresh training course to new reps directly inside their mobile app?"
    ],
    oneLiner: "Their system requires support setup; Acme offers same-day launch and complete operational agility.",
    metrics: [
      { label: "Integration time", value: "< 2 hours" },
      { label: "Ramp up window", value: "Under 1 day" }
    ]
  },
  {
    id: "crm_pipeline",
    category: "report_claim",
    objection: "We already have standard pipeline cards in our current CRM to organize jobs.",
    counterWedge: "Standard CRMs treat customer records like flat contact folders. Acme replaces simple boxes with a dedicated roof file timeline. Built specifically for roofing contractors, it unifies shingle measurements, storm dates, adjuster reports, signed contracts, and commission states, making evidence adjuster-ready instantly.",
    discoveryQuestions: [
      "Does your current CRM track roof parameters, wind direction, and adjuster packets natively on a single screen?",
      "How do your reps check their current pending commission payouts on active active installations?"
    ],
    oneLiner: "Older databases organize spreadsheets. Acme operates as a true field OS for your roofers.",
    metrics: [
      { label: "Double-entry errors", value: "0" },
      { label: "Average contract value", value: "+12%" }
    ]
  }
];

// High-fidelity fallback templates for each article and creative angle mapping
export function getPrecompiledTemplates(articleId: string, angle: string): SocialTemplate[] {
  return [
    {
      platform: "linkedin",
      angle: "category_reframe" as any,
      title: "Category Reframe Post",
      content: `Let's stop talking about "speed-to-lead" in roofing. 

Fast appointment booking is useful. But booking is the doorway, not the house.

What happens after the inspection is scheduled?
- Are shingle photos sitting in an icloud drive?
- Are pitch numbers on a physical notebook in a truck?
- Are commission guidelines on an excel sheet?

If your field system is fragmented, fast bookings just turn into expensive ghost appointments. 

With Acme, we've replaced flat CRM contacts with a complete **Roof File**. A unified timeline housing storm evidence, measurements, adjuster reports, signed files, project stages, and payouts. 

Keep your whole roofing workflow in one file. Real leverage starts after the booking.

#Roofing #StormRestoration #SalesEnablement #FieldOperations #Acme`
    },
    {
      platform: "instagram",
      angle: "category_reframe" as any,
      title: "Instagram Slide Series",
      content: "Aesthetic Brand Carousel preview showing premium Contrast surfaces.",
      slides: [
        "Slide 1: Speed to lead is a lie. 🚪\n(And what actually closes the roof file...)",
        "Slide 2: Chatbots book inspections 24/7. But when the rep knocks on Monday:\n- Where are the HailTrace storm overlays?\n- Where are the shingle damage photos?",
        "Slide 3: Without physical proof, a booked slot goes cold. You need structure, not just speed.",
        "Slide 4: Acme couples CRM pipelines with real roof evidence. One file. Zero chaos.\n👉 Start free trial at Acme.com"
      ]
    },
    {
      platform: "short_video",
      angle: "category_reframe" as any,
      title: "TikTok / Shorts Teaser",
      content: "[Hook] Why most roofing companies do $1M but take home less than 10%.\n\n[Visual] Show truck, transition to smartphone map. HUD scan line overlay of house shingles.\n\n[Directive] Show deep contrast bronze text cards.",
      videoDirectives: "Fast pacing. Cinematic dark twilight cover. Highlight the golden bronze badge: 'Speed vs Proof'. Standard caption overlay."
    }
  ];
}
