#!/usr/bin/env node

const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.text({ type: "text/*", limit: "1mb" }));

const port = Number(process.env.MISSION_GATEWAY_PORT || 8787);
const paperclipWebhookUrl = process.env.PAPERCLIP_WEBHOOK_URL || "";
const opencodeBaseUrl = (process.env.OPENCODE_BASE_URL || "http://127.0.0.1:4096").replace(/\/$/, "");
const opencodeUser = process.env.OPENCODE_SERVER_USERNAME || "opencode";
const opencodePass = process.env.OPENCODE_SERVER_PASSWORD || "";
const fallbackEnabled = String(process.env.OPENCODE_FALLBACK_ENABLED || "false").toLowerCase() === "true";
const incomingApiKey = process.env.MISSION_GATEWAY_API_KEY || "";
const missionStatus = new Map();

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

function checkApiKey(req, res) {
  if (!incomingApiKey) {
    return true;
  }

  const provided = req.get("x-api-key") || "";
  if (provided !== incomingApiKey) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return false;
  }

  return true;
}

function normalizeMission(rawBody, defaultSource) {
  const raw = rawBody == null ? {} : rawBody;

  if (typeof raw === "string") {
    const text = raw.trim();
    return {
      mission_id: `mission_${Date.now()}`,
      prompt: text,
      goal: text,
      source: defaultSource,
      mode: "voice-fire-and-forget",
    };
  }

  const prompt =
    raw.prompt ||
    raw.goal ||
    raw.task ||
    raw.instruction ||
    raw.input ||
    raw.transcript ||
    "";

  return {
    ...raw,
    prompt,
    goal: raw.goal || prompt,
    source: raw.source || defaultSource,
    mission_id: raw.mission_id || raw.id || `mission_${Date.now()}`,
    mode: raw.mode || "standard",
  };
}

async function dispatchMission(payload) {
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

  return { paperclip, fallback };
}

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "paperclip-mission-gateway",
    paperclip_configured: Boolean(paperclipWebhookUrl),
    opencode_fallback_enabled: fallbackEnabled,
    api_key_required: Boolean(incomingApiKey),
    opencode_base_url: opencodeBaseUrl,
  });
});

app.post("/missions", async (req, res) => {
  if (!checkApiKey(req, res)) {
    return;
  }

  const mission = normalizeMission(req.body, "chatgpt-action");
  if (!mission.goal && !mission.prompt) {
    return res.status(400).json({
      success: false,
      error: "Mission must include 'goal' or 'prompt'",
    });
  }

  const missionId = mission.mission_id;
  const payload = {
    ...mission,
    mission_id: missionId,
    received_at: new Date().toISOString(),
  };

  const { paperclip, fallback } = await dispatchMission(payload);

  return res.status(202).json({
    success: true,
    mission_id: missionId,
    paperclip,
    fallback,
  });
});

app.post("/missions/fire-and-forget", (req, res) => {
  if (!checkApiKey(req, res)) {
    return;
  }

  const mission = normalizeMission(req.body, "voice-client");
  if (!mission.goal && !mission.prompt) {
    return res.status(400).json({
      success: false,
      error: "Mission must include prompt, goal, task, instruction, input, or transcript",
    });
  }

  const missionId = mission.mission_id;
  const payload = {
    ...mission,
    mission_id: missionId,
    async: true,
    received_at: new Date().toISOString(),
  };

  missionStatus.set(missionId, {
    mission_id: missionId,
    status: "queued",
    updated_at: new Date().toISOString(),
  });

  setImmediate(async () => {
    missionStatus.set(missionId, {
      mission_id: missionId,
      status: "running",
      updated_at: new Date().toISOString(),
    });

    try {
      const result = await dispatchMission(payload);
      missionStatus.set(missionId, {
        mission_id: missionId,
        status: "completed",
        updated_at: new Date().toISOString(),
        result,
      });
    } catch (err) {
      missionStatus.set(missionId, {
        mission_id: missionId,
        status: "failed",
        updated_at: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return res.status(202).json({
    success: true,
    accepted: true,
    mission_id: missionId,
    status_url: `/missions/${missionId}/status`,
  });
});

app.get("/missions/:missionId/status", (req, res) => {
  if (!checkApiKey(req, res)) {
    return;
  }

  const missionId = req.params.missionId;
  const state = missionStatus.get(missionId);
  if (!state) {
    return res.status(404).json({ success: false, error: "Mission status not found" });
  }

  return res.json({ success: true, ...state });
});

app.listen(port, () => {
  console.log(`paperclip-mission-gateway listening on http://0.0.0.0:${port}`);
});
