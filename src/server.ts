import { config } from "dotenv";
config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MWaterClient } from "./mwaterClient.js";

const username = process.env.MWATER_USERNAME;
const password = process.env.MWATER_PASSWORD;
const baseUrl = process.env.MWATER_BASE_URL;
const port = process.env.PORT ? Number(process.env.PORT) : undefined;

if (!username || !password) {
  console.warn(
    "MWATER_USERNAME and MWATER_PASSWORD must be set (e.g. in .env) before starting the MCP server."
  );
}

const client = new MWaterClient({
  username: username ?? "",
  password: password ?? "",
  baseUrl
});

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 20;
const DEFAULT_FIELDS = ["name", "type", "depth", "constructed_on", "code", "status"];
const STARTUP_MESSAGE = [
  "Welcome to the mWater MCP helper.",
  "1) Use nearest_boreholes for a quick borehole table near a GPS point.",
  "2) Use nearest_entities for custom nearby searches (add extraFilter for type/status).",
  "3) Keep limit small (10–50). Big pulls need filters.",
  "4) If unsure of columns, run list_properties(\"water_point\").",
  "5) Everything here is read-only; no writes to mWater."
].join("\n");

const server = new McpServer({
  name: "mwater-mcp",
  version: "0.1.0"
});

server.tool(
  "ping",
  {
    description: "Check connectivity with mWater API.",
    inputSchema: z.object({})
  },
  async () => {
    const result = await client.ping();
    return { content: [{ type: "text", text: `API replied: ${result}` }] };
  }
);

server.tool(
  "show_readme",
  {
    description: "Return a short README for first-time users (safe to auto-run on connect).",
    inputSchema: z.object({})
  },
  async () => {
    return { content: [{ type: "text", text: STARTUP_MESSAGE }] };
  }
);

server.tool(
  "getting_started",
  {
    description: "Show quick instructions and safe defaults for WASH users.",
    inputSchema: z.object({})
  },
  async () => {
    return { content: [{ type: "text", text: STARTUP_MESSAGE }] };
  }
);

server.tool(
  "list_entity_types",
  {
    description: "List all entity types (tables) in the tenant.",
    inputSchema: z.object({})
  },
  async () => {
    const types = await client.listEntityTypes();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(types, null, 2)
        }
      ]
    };
  }
);

server.tool(
  "list_properties",
  {
    description: "List properties (columns) for an entity type.",
    inputSchema: z.object({
      entityType: z.string()
    })
  },
  async ({ entityType }) => {
    const props = await client.listProperties(entityType);
    return {
      content: [
        { type: "text", text: JSON.stringify(props, null, 2) }
      ]
    };
  }
);

const querySchema = z.object({
  entityCode: z.string(),
  filter: z.union([z.string(), z.record(z.any())]).optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT),
  fields: z.record(z.number()).optional(),
  sort: z.union([z.array(z.string()), z.record(z.number())]).optional()
});

server.tool(
  "query_entities",
  {
    description:
      "Query entities by code with optional Mongo-style filter, projection, sort, and limit.",
    inputSchema: querySchema
  },
  async ({ entityCode, filter, limit, fields, sort }) => {
    const parsedFilter = parseFilter(filter);
    if (!parsedFilter && (limit ?? DEFAULT_LIMIT) > DEFAULT_LIMIT) {
      throw new Error(
        `Please add a filter when requesting more than ${DEFAULT_LIMIT} records to avoid huge downloads.`
      );
    }
    const data = await client.queryEntities(entityCode, {
      filter: parsedFilter,
      limit,
      fields,
      sort
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
);

const nearestSchema = z.object({
  entityCode: z.string().default("water_point"),
  latitude: z.number(),
  longitude: z.number(),
  limit: z.number().int().positive().max(50).optional().default(10),
  maxDistanceMeters: z.number().positive().optional().default(20000),
  extraFilter: z.union([z.string(), z.record(z.any())]).optional(),
  fields: z.array(z.string()).optional()
});

server.tool(
  "nearest_entities",
  {
    description:
      "Find nearest entities (e.g., boreholes/water points) to a location. Uses $near on the location field.",
    inputSchema: nearestSchema
  },
  async ({
    entityCode,
    latitude,
    longitude,
    limit,
    maxDistanceMeters,
    extraFilter,
    fields
  }) => {
    const nearFilter = makeNearFilter(latitude, longitude, maxDistanceMeters);

    const mergedFilter = mergeFilters(nearFilter, parseFilter(extraFilter));

    const projection = fields
      ? Object.fromEntries(fields.map((f) => [f, 1]))
      : undefined;

    const data = await client.queryEntities(entityCode, {
      filter: mergedFilter,
      limit,
      fields: projection
    });

    return {
      content: [
        {
          type: "text",
          text: formatNearestTable(data, fields)
        }
      ]
    };
  }
);

server.tool(
  "list_groups",
  {
    description: "List groups/organizations. Use includePrivate to view private groups.",
    inputSchema: z.object({
      includePrivate: z.boolean().optional()
    })
  },
  async ({ includePrivate = false }) => {
    const groups = await client.listGroups(includePrivate);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(groups, null, 2)
        }
      ]
    };
  }
);

const boreholeSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  limit: z.number().int().positive().max(50).optional().default(10),
  maxDistanceMeters: z.number().positive().optional().default(20000)
});

server.tool(
  "nearest_boreholes",
  {
    description:
      "Fast path for WASH users: nearest boreholes around a point with a ready-made table.",
    inputSchema: boreholeSchema
  },
  async ({ latitude, longitude, limit, maxDistanceMeters }) => {
    const nearFilter = makeNearFilter(latitude, longitude, maxDistanceMeters);
    const boreholeFilter = { type: "Borehole" };
    const data = await client.queryEntities("water_point", {
      filter: mergeFilters(nearFilter, boreholeFilter),
      limit,
      fields: Object.fromEntries(DEFAULT_FIELDS.map((f) => [f, 1]))
    });

    return {
      content: [
        {
          type: "text",
          text: formatNearestTable(data, DEFAULT_FIELDS)
        }
      ]
    };
  }
);

server.setErrorHandler((err) => {
  return {
    content: [{ type: "text", text: `Error: ${(err as Error).message}` }]
  };
});

function parseFilter(input?: unknown) {
  if (input === undefined) return undefined;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      throw new Error("filter must be valid JSON string if provided as string");
    }
  }
  return input;
}

function mergeFilters(
  a: Record<string, unknown>,
  b?: Record<string, unknown> | string | undefined
) {
  if (!b) return a;
  if (typeof b === "string") {
    try {
      return { ...a, ...JSON.parse(b) };
    } catch {
      throw new Error("extraFilter must be valid JSON string if provided as string");
    }
  }
  return { ...a, ...b };
}

function makeNearFilter(
  latitude: number,
  longitude: number,
  maxDistanceMeters?: number
) {
  return {
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        ...(maxDistanceMeters ? { $maxDistance: maxDistanceMeters } : {})
      }
    }
  };
}

function formatNearestTable(
  rows: unknown,
  fields?: string[]
): string {
  if (!Array.isArray(rows)) return JSON.stringify(rows, null, 2);
  const cols =
    fields && fields.length > 0
      ? ["code", ...fields]
      : ["code", "name", "type", "depth", "constructed_on"];
  const header = cols.join(" | ");
  const sep = cols.map(() => "---").join(" | ");
  const lines = rows.slice(0, 10).map((r) => {
    const row = r as Record<string, unknown>;
    return cols
      .map((c) => stringifyCell(row[c]))
      .join(" | ");
  });
  return [header, sep, ...lines].join("\n");
}

function stringifyCell(v: unknown) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (port) {
    console.log(`mWater MCP server started on stdio (env PORT=${port} ignored for stdio).`);
  } else {
    console.log("mWater MCP server started on stdio.");
  }
  console.log("Tip: configure your bot to call 'show_readme' or 'getting_started' on connect for a 1-minute guide.");
}

main().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
