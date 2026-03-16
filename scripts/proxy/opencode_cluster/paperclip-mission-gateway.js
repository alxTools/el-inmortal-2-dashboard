#!/usr/bin/env node

const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.MISSION_GATEWAY_PORT || 8787);
const paperclipWebhookUrl = process.env.PAPERCLIP_WEBHOOK_URL || "";
const opencodeBaseUrl = (process.env.OPENCODE_BASE_URL || "http://127.0.0.1:4096").replace(/\/$/, "");
const opencodeUser = process.env.OPENCODE_SERVER_USERNAME || "opencode";
const opencodePass = process.env.OPENCODE_SERVER_PASSWORD || "";
const fallbackEnabled = String(process.env.OPENCODE_FALLBACK_ENABLED || "false").toLowerCase() === "true";

function basicAuthHeader(user, pass) {
  const token = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function sendToPaperclip(payload) {
  if (!paperclipWebhookUrl) {
    return {
      ok: false,
      skipped: true,
      status: 0,
      error: "PAPERCLIP_WEBHOOK_URL is not configured",
    };
  }

  try {
    const res = await fetch(paperclipWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let body = null;
    try {
      body = await res.json();
    } catch (_err) {
      body = null;
    }

    return {
      ok: res.ok,
      skipped: false,
      status: res.status,
      body,
      error: res.ok ? null : `Paperclip webhook returned ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function executeDirectlyInOpenCode(mission) {
  if (!opencodePass) {
    throw new Error("OPENCODE_SERVER_PASSWORD is required for direct fallback");
  }

  const auth = basicAuthHeader(opencodeUser, opencodePass);

  const createSessionRes = await fetch(`${opencodeBaseUrl}/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({}),
  });

  if (!createSessionRes.ok) {
    throw new Error(`session create failed (${createSessionRes.status})`);
  }

  const session = await createSessionRes.json();
  const sessionId = session.id;
  if (!sessionId) {
    throw new Error("session create response did not include id");
  }

  const prompt =
    mission.prompt ||
    mission.goal ||
    "Run the provided mission with a clear step-by-step execution report and final summary.";

  const messageRes = await fetch(`${opencodeBaseUrl}/session/${sessionId}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({
      parts: [{ type: "text", text: prompt }],
    }),
  });

  if (!messageRes.ok) {
    throw new Error(`message send failed (${messageRes.status})`);
  }

  const reply = await messageRes.json();
  const parts = Array.isArray(reply.parts) ? reply.parts : [];
  const text = parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return {
    session_id: sessionId,
    response_text: text,
    raw_parts: parts,
  };
}

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "paperclip-mission-gateway",
    paperclip_configured: Boolean(paperclipWebhookUrl),
    opencode_fallback_enabled: fallbackEnabled,
    opencode_base_url: opencodeBaseUrl,
  });
});

app.post("/missions", async (req, res) => {
  const mission = req.body || {};
  if (!mission.goal && !mission.prompt) {
    return res.status(400).json({
      success: false,
      error: "Mission must include 'goal' or 'prompt'",
    });
  }

  const missionId = mission.mission_id || mission.id || `mission_${Date.now()}`;
  const payload = {
    ...mission,
    mission_id: missionId,
    source: mission.source || "chatgpt-action",
    received_at: new Date().toISOString(),
  };

  const paperclip = await sendToPaperclip(payload);

  let fallback = null;
  if ((!paperclip.ok || paperclip.skipped) && fallbackEnabled) {
    try {
      const run = await executeDirectlyInOpenCode(payload);
      fallback = {
        ok: true,
        ...run,
      };
    } catch (err) {
      fallback = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return res.status(202).json({
    success: true,
    mission_id: missionId,
    paperclip,
    fallback,
  });
});

app.listen(port, () => {
  console.log(`paperclip-mission-gateway listening on http://0.0.0.0:${port}`);
});
