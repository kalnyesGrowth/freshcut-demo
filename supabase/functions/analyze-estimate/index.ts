import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://fresh-cut-landscape.com",
  "https://www.fresh-cut-landscape.com",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

const BUCKET = "estimate-photos";

// TODO: move to persistent counter (see KG hotfix pattern)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

const SERVICE_PROMPTS: Record<string, string> = {
  tree_trim: `You are analyzing photos of a tree for a landscaping company. Determine:
1. service_match: Does this photo show a tree that needs trimming or removal? (true/false)
2. size_class: Estimate tree height category: "small" (under 20ft), "medium" (20-40ft), "large" (40-60ft), "xl" (60ft+)
3. condition: Overall condition: "light" (minor trim), "average" (moderate work), "heavy" (major work/dead branches)
4. hazards: Array of applicable hazards: "near_structure", "near_powerlines", "steep_slope", "poor_access"
5. confidence: Your confidence in the assessment (0.0 to 1.0)
6. notes: Brief description of what you see

Respond ONLY with valid JSON matching this schema. No markdown, no explanation.`,

  leaf_cleanup: `You are analyzing photos of a yard for a landscaping company to estimate leaf/yard cleanup. Determine:
1. service_match: Does this photo show a yard needing cleanup? (true/false)
2. size_class: Not applicable, set to "n/a"
3. condition: Leaf/debris level: "light" (thin scattering), "average" (moderate coverage), "heavy" (thick layer, multiple trees)
4. hazards: Array of any complications: "near_structure", "steep_slope", "poor_access"
5. confidence: Your confidence in the assessment (0.0 to 1.0)
6. notes: Brief description of what you see

Respond ONLY with valid JSON matching this schema. No markdown, no explanation.`,

  storm_cleanup: `You are analyzing photos of storm damage for a landscaping company. Determine:
1. service_match: Does this photo show storm damage needing cleanup? (true/false)
2. size_class: Estimated scope: "small" (minor debris), "medium" (fallen branches), "large" (fallen trees/major damage), "xl" (multiple trees/structural)
3. condition: Severity: "light", "average", "heavy"
4. hazards: Array of hazards: "near_structure", "near_powerlines", "steep_slope", "poor_access", "standing_water", "structural_damage"
5. confidence: Your confidence in the assessment (0.0 to 1.0)
6. notes: Brief description of damage observed

Respond ONLY with valid JSON matching this schema. No markdown, no explanation.`,
};

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { service, photo_paths, address, tree_size, tree_job, condition } = body;

    if (!service || !photo_paths || !Array.isArray(photo_paths) || photo_paths.length === 0) {
      return new Response(JSON.stringify({ error: "Missing service or photo_paths" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({
        analysis: {
          service_match: true,
          size_class: tree_size || "medium",
          condition: condition || "average",
          hazards: [],
          confidence: 0.3,
          notes: "AI analysis unavailable. Using manual input.",
        },
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const imageContents: Array<{ type: "image"; source: { type: "base64"; media_type: string; data: string } }> = [];
    const signedUrls: string[] = [];

    for (const path of photo_paths.slice(0, 6)) {
      const { data: fileData, error: dlError } = await supabase.storage
        .from(BUCKET)
        .download(path);

      if (dlError || !fileData) {
        console.warn(`Failed to download ${path}:`, dlError);
        continue;
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const mediaType = path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : "image/jpeg";

      imageContents.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      });

      const { data: signedUrl } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);

      if (signedUrl?.signedUrl) {
        signedUrls.push(signedUrl.signedUrl);
      }
    }

    if (imageContents.length === 0) {
      return new Response(JSON.stringify({
        analysis: {
          service_match: true,
          size_class: tree_size || "medium",
          condition: condition || "average",
          hazards: [],
          confidence: 0.3,
          notes: "Could not process photos. Using manual input.",
        },
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = SERVICE_PROMPTS[service] || SERVICE_PROMPTS.tree_trim;

    let userContext = `Service requested: ${service}. Address: ${address || "not provided"}.`;
    if (service === "tree_trim") {
      userContext += ` Customer says: tree size=${tree_size || "unknown"}, job=${tree_job || "trim"}.`;
    }
    userContext += ` Customer self-assessed condition: ${condition || "average"}.`;
    userContext += " Analyze the photo(s) and return your assessment as JSON.";

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 512,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              ...imageContents,
              { type: "text", text: userContext },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      console.error("Claude API error:", claudeResponse.status, errText);
      return new Response(JSON.stringify({
        analysis: {
          service_match: true,
          size_class: tree_size || "medium",
          condition: condition || "average",
          hazards: [],
          confidence: 0.3,
          notes: "AI analysis temporarily unavailable. Using manual input.",
        },
        signed_urls: signedUrls,
      }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const claudeData = await claudeResponse.json();
    const textBlock = claudeData.content?.find((b: { type: string }) => b.type === "text");
    let analysis;

    try {
      const raw = textBlock?.text || "{}";
      const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = {
        service_match: true,
        size_class: tree_size || "medium",
        condition: condition || "average",
        hazards: [],
        confidence: 0.3,
        notes: "AI response parsing failed. Using manual input.",
      };
    }

    return new Response(JSON.stringify({
      analysis,
      signed_urls: signedUrls,
    }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Analyze estimate error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
