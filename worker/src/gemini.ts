import type { Env } from "./env";
import { llmJson } from "./llm";

// Ports the two Express routes from the suite's server.ts (generate-workflow,
// generate-campaign) — now routed through the universal llmJson helper so
// Gemini→OpenAI fallback applies. The Gemini-specific responseSchema config is
// dropped in favour of a JSON-shape directive in the prompt, which works for
// both providers.

export interface GenerateWorkflowInput {
  brief: string;
  brandGuide?: string;
  constraints?: string;
  aspectRatios?: string[];
}

export async function generateWorkflow(env: Env, input: GenerateWorkflowInput): Promise<unknown> {
  const aspectRatios = (input.aspectRatios || ["1:1", "9:16", "16:9"]).join(", ");
  const prompt = `You are a high-ticket creative director, digital scriptwriter, and lead AI prompt designer for a premium media studio.
You specialize in designing highly targeted, multi-stage, product-consistent visual content pipelines.

Inputs:
- Creative brief: ${input.brief}
- Brand voice: ${input.brandGuide || "Premium, tech-focused, elegant and trustworthy"}
- Negative constraints: ${input.constraints || "No cartoon drawings, no deformities, keep product focused"}
- Desired aspect ratios: ${aspectRatios}

Produce a structured, complete, optimized multi-concept marketing asset workflow.
Propose 3 distinct campaign visual environments / concept nodes.

For each concept include:
1. A descriptive title.
2. imagePrompt — hyper-detailed: subjects, camera settings, lighting, depth of field, background.
3. videoPrompt — exact temporal camera motion (slow glide, tilt-up), environmental physics, frame pacing, stability.
4. socialPostCopy — high-converting, concept-specific.
5. Key mood words + lighting guidelines.

Return strict JSON with this shape:
{
  "normalizedBrief": "polished, structured normalization of the brief",
  "concepts": [
    {
      "id": 1,
      "title": "Concept 1 Title",
      "mood": "luxurious, warm, authentic",
      "lighting": "golden hour dusk with soft ambient fill light",
      "imagePrompt": "...",
      "videoPrompt": "...",
      "socialPostCopy": "...",
      "recommendedRatios": ["1:1", "9:16"]
    }
  ]
}`;

  const { data } = await llmJson(env, prompt, { maxTokens: 4096 });
  return data;
}

export interface GenerateCampaignInput {
  article: { title: string; description: string; content: string; category: string };
  platform: "linkedin" | "instagram" | "short_video";
  angle: string;
}

export async function generateCampaign(env: Env, input: GenerateCampaignInput): Promise<unknown> {
  const { article, platform, angle } = input;
  const platformGuidance: Record<string, string> = {
    linkedin: "1300-1900 chars, 3-5 line hook, mid-form thought leadership, NO emojis spam, end with a question",
    instagram: "5-8 carousel slides as separate strings, hook in slide 1 (≤7 words), CTA in last slide, max 2200 chars caption",
    short_video: "30-60s vertical short. videoDirectives covers scene-by-scene visual+VO + hook lines + B-roll cues + CTA",
  };

  const prompt = `You are an elite B2B social ghostwriter for ACME — a roofing-industry intelligence studio.
Voice: confident operator, no fluff, data-led, surgical CTA. Always specific, never generic.
Produce platform-native output respecting the constraints below.

Draft a ${platform} campaign post from this article using the "${angle.replace(/_/g, " ")}" creative angle.

Article title: ${article.title}
Category: ${article.category}
Description: ${article.description}
Content excerpt:
${article.content.slice(0, 3000)}

Platform constraints: ${platformGuidance[platform] ?? platformGuidance.linkedin}

Return strict JSON with this shape:
{
  "platform": "${platform}",
  "angle": "${angle}",
  "title": "Internal label for this draft",
  "content": "main post body OR caption",
  "slides": ["..."],            // only for instagram
  "videoDirectives": "...",     // only for short_video
  "tags": ["tag1", "tag2"]       // 3-7 short tags
}`;

  const { data } = await llmJson(env, prompt, { maxTokens: 3072 });
  return data;
}
