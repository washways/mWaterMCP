# mWater MCP Server

Model Context Protocol server for Nanobot/OpenClaw that reads mWater v3 data (water points, boreholes, etc.) with safe defaults for WASH users.

## Quick start (simplest)
- Windows: run `run.ps1`
- Mac/Linux: `chmod +x run.sh && ./run.sh`

The script asks for your mWater username/password, writes `.env`, installs dependencies, and starts the server. Leave it running.

Manual alternative:
1) Copy `.env.example` to `.env` and fill in your mWater login.
2) `npm run quickstart`  (installs + starts)
   - or `npm install`, then `npx ts-node src/server.ts` (dev) or `npm start` after `npm run build`.

## Exposed tools
- `ping` – check connection.
- `list_entity_types` – list all tables.
- `list_properties(entityType)` – columns for a table.
- `query_entities(entityCode, filter?, limit?, fields?, sort?)` – filtered queries (defaults limit=20; blocks large unfiltered pulls).
- `list_groups(includePrivate?)` – list organizations/groups.
- `nearest_entities(entityCode, latitude, longitude, limit?, maxDistanceMeters?, extraFilter?, fields?)` – generic nearest search.
- `nearest_boreholes(latitude, longitude, limit?, maxDistanceMeters?)` – one-step borehole table (entity `water_point`, filter type=`Borehole`, fields name/type/depth/constructed_on/code/status).
- `getting_started()` – returns a 1‑minute how-to inside the bot.
- `show_readme()` – same as above; safe to auto-run when a session starts.

## Non‑tech usage (copy/paste)
1) Put this folder on the same VPS where your bot runs.  
2) Run `run.ps1` (Windows) or `./run.sh` (Mac/Linux).  
3) Point Nanobot/OpenClaw to `mcp-manifest.json` in this folder (it already knows the command and env vars).  
4) Ask your bot in plain language, for example:
   - "Show the 10 nearest boreholes to -13.962, 33.774."
   - "What’s the depth of the nearest borehole to -13.962, 33.774?"
   - "When were the nearest 10 boreholes built? Give a short table."
   - "List water points within 5 km of -13.962, 33.774 with their status."

## Practical WASH filters and guardrails
- Big tables must be filtered: requests above the default limit (20) require a filter.
- Use `nearest_boreholes` for the fastest safe answer around a GPS point.
- If your dataset names boreholes differently, change the filter via `extraFilter` (e.g., `{"system_type":"Borehole"}`).
- To see available columns, run `list_properties("water_point")` before querying.
- Default `maxDistanceMeters` is 20,000 (20 km); adjust as needed.

## Ask your own questions
- Know the table? Use `query_entities` with `filter` and `fields` to keep results small.  
  Example: `entityCode="water_point"`, `filter={"status":"Functional"}`, `limit=20`, `fields={"name":1,"status":1,"code":1}`.  
- Not sure of columns? Call `list_properties("water_point")`.  
- Location questions: use `nearest_entities` (custom) or `nearest_boreholes` (preset).

## Where to run it
- Easiest: same VPS as your bot (stdio MCP local process).  
- If remote, you’d need an MCP TCP/SSH bridge; stick to same VPS unless you already have one.

## Auto-show the guide (do this in your bot)
- Configure Nanobot/OpenClaw (or any MCP client) to call `show_readme` or `getting_started` immediately after connecting. That will display the short instructions to the user without them typing anything.

## WhatsApp chatbot (outline)
1) Get a WhatsApp Business number (Twilio or Meta Cloud API).  
2) Make a tiny relay (Node + Express): receive webhook -> forward text to your running bot -> send bot reply back to WhatsApp.  
3) Keep the relay stateless; all data access stays in this MCP server with the same guardrails.

## Testing ideas
- `ping` should return quickly.  
- `nearest_boreholes` with your coordinates, `limit=5`.  
- `list_properties("water_point")` to confirm field names.
