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

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB
const MAX_PHOTOS_PER_SESSION = 6;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "estimate-photos";

// TODO: move to persistent counter (see KG hotfix pattern)
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
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
    const { session_id, file_name, file_type, file_size } = body;

    if (!session_id || !file_name || !file_type || !file_size) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (!ALLOWED_TYPES.includes(file_type)) {
      return new Response(JSON.stringify({ error: "Only JPG, PNG, and WebP images are accepted" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (file_size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: "File too large. Maximum 8MB." }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await supabase.storage
      .from(BUCKET)
      .list(`${session_id}/`);

    if (existing && existing.length >= MAX_PHOTOS_PER_SESSION) {
      return new Response(JSON.stringify({ error: "Maximum 6 photos per estimate" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const ext = file_name.split(".").pop() || "jpg";
    const photoIndex = (existing?.length || 0) + 1;
    const storagePath = `${session_id}/photo-${photoIndex}.${ext}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (uploadError) {
      console.error("Signed URL error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to create upload URL" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      upload_url: uploadData.signedUrl,
      storage_path: storagePath,
      token: uploadData.token,
    }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Upload estimate photo error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
