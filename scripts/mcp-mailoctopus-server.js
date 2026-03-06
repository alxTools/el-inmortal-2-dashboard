#!/usr/bin/env node

const https = require("https");

const API_BASE = process.env.MAILOCTOPUS_API_BASE || "https://emailoctopus.com/api/1.6";
const API_KEY =
  process.env.MAILOCTOPUS_API_KEY ||
  process.env.EMAIL_OCTOPUS_API_KEY ||
  process.env.MAIL_OCTOPUS_API_KEY;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, data } });
}

function textContent(payload) {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function request(pathname, method = "GET", body) {
  if (!API_KEY) {
    throw new Error("Missing MAILOCTOPUS_API_KEY (or EMAIL_OCTOPUS_API_KEY) in environment");
  }

  const endpoint = new URL(`${API_BASE}${pathname}`);
  endpoint.searchParams.set("api_key", API_KEY);

  const payload = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const req = https.request(
      endpoint,
      {
        method,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch (error) {
            reject(new Error(`Mailoctopus returned non-JSON response (${res.statusCode})`));
            return;
          }

          if (res.statusCode >= 400) {
            reject(new Error(parsed.error?.message || `Mailoctopus HTTP ${res.statusCode}`));
            return;
          }

          resolve(parsed);
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function handleToolCall(name, args) {
  switch (name) {
    case "mailoctopus_list_lists": {
      const data = await request("/lists");
      return textContent(data);
    }
    case "mailoctopus_list_contacts": {
      if (!args?.list_id) throw new Error("Missing required argument: list_id");
      const qs = [];
      if (args.limit) qs.push(`limit=${encodeURIComponent(args.limit)}`);
      if (args.offset) qs.push(`offset=${encodeURIComponent(args.offset)}`);
      const suffix = qs.length ? `?${qs.join("&")}` : "";
      const data = await request(`/lists/${encodeURIComponent(args.list_id)}/contacts${suffix}`);
      return textContent(data);
    }
    case "mailoctopus_add_contact": {
      if (!args?.list_id) throw new Error("Missing required argument: list_id");
      if (!args?.email_address) throw new Error("Missing required argument: email_address");
      const body = {
        email_address: args.email_address,
        fields: args.fields || {},
        tags: Array.isArray(args.tags) ? args.tags : [],
        status: args.status || "SUBSCRIBED",
      };
      const data = await request(`/lists/${encodeURIComponent(args.list_id)}/contacts`, "POST", body);
      return textContent(data);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const tools = [
  {
    name: "mailoctopus_list_lists",
    description: "List all Mailoctopus lists in the account",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "mailoctopus_list_contacts",
    description: "List contacts for a specific Mailoctopus list",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string", description: "Mailoctopus list ID" },
        limit: { type: "number", description: "Optional page size" },
        offset: { type: "number", description: "Optional offset" },
      },
      required: ["list_id"],
      additionalProperties: false,
    },
  },
  {
    name: "mailoctopus_add_contact",
    description: "Add or update a contact in a Mailoctopus list",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string", description: "Mailoctopus list ID" },
        email_address: { type: "string", description: "Contact email" },
        fields: { type: "object", description: "Custom fields map" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional tags",
        },
        status: {
          type: "string",
          enum: ["SUBSCRIBED", "UNSUBSCRIBED", "PENDING"],
          description: "Contact status",
        },
      },
      required: ["list_id", "email_address"],
      additionalProperties: false,
    },
  },
];

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf("\n");

  while (index >= 0) {
    const raw = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    index = buffer.indexOf("\n");

    if (!raw) continue;

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (error) {
      fail(null, -32700, "Parse error", error.message);
      continue;
    }

    const { id, method, params } = msg;

    try {
      if (method === "initialize") {
        ok(id, {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "mailoctopus-mcp-local",
            version: "0.1.0",
          },
          capabilities: {
            tools: {},
          },
        });
        continue;
      }

      if (method === "notifications/initialized") {
        continue;
      }

      if (method === "tools/list") {
        ok(id, { tools });
        continue;
      }

      if (method === "tools/call") {
        const result = await handleToolCall(params?.name, params?.arguments || {});
        ok(id, result);
        continue;
      }

      fail(id, -32601, `Method not found: ${method}`);
    } catch (error) {
      fail(id, -32000, error.message);
    }
  }
});
