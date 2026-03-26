import axios, { AxiosInstance } from "axios";

export type QueryOptions = {
  filter?: unknown;
  limit?: number;
  fields?: Record<string, number>;
  sort?: string[] | Record<string, number>;
  includePrivateGroups?: boolean;
};

export class MWaterClient {
  private readonly username: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly http: AxiosInstance;
  private clientId?: string;

  constructor(opts: { username: string; password: string; baseUrl?: string }) {
    this.username = opts.username;
    this.password = opts.password;
    this.baseUrl = opts.baseUrl ?? "https://api.mwater.co/v3";

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: { "Content-Type": "application/json" }
    });
  }

  async login(): Promise<string> {
    if (this.clientId) return this.clientId;

    const res = await this.http.post("/clients", {
      username: this.username,
      password: this.password
    });

    const token = res.data?.client ?? res.data?.id ?? res.data;
    if (!token || typeof token !== "string") {
      throw new Error("mWater login did not return a client id");
    }

    this.clientId = token;
    return token;
  }

  private async withClient<T>(
    fn: (client: string) => Promise<T>
  ): Promise<T> {
    const client = await this.login();
    return fn(client);
  }

  async ping(): Promise<string> {
    const res = await this.http.get("/ping");
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
  }

  async listEntityTypes() {
    return this.withClient(async (client) => {
      const res = await this.http.get("/entity_types", { params: { client } });
      return res.data;
    });
  }

  async listProperties(entityType: string) {
    if (!entityType) throw new Error("entityType is required");

    return this.withClient(async (client) => {
      const res = await this.http.get("/properties", {
        params: {
          client,
          filter: JSON.stringify({ entity_type: entityType })
        }
      });
      return res.data;
    });
  }

  async listGroups(includePrivate = false) {
    return this.withClient(async (client) => {
      const params: Record<string, unknown> = {};
      if (includePrivate) params.client = client;
      const res = await this.http.get("/groups", { params });
      return res.data;
    });
  }

  async queryEntities(entityCode: string, options: QueryOptions = {}) {
    if (!entityCode) throw new Error("entityCode is required");

    return this.withClient(async (client) => {
      const params: Record<string, unknown> = { client };
      if (options.filter !== undefined)
        params.filter =
          typeof options.filter === "string"
            ? options.filter
            : JSON.stringify(options.filter);
      if (options.limit !== undefined) params.limit = options.limit;
      if (options.fields !== undefined)
        params.fields = JSON.stringify(options.fields);
      if (options.sort !== undefined) params.sort = JSON.stringify(options.sort);

      const res = await this.http.get(`/entities/${entityCode}`, { params });
      return res.data;
    });
  }
}
