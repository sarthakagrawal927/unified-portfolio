import { normalizePositions } from "../positions";
import { z } from "zod";
import Decimal from "decimal.js";
import {
  ProviderError,
  instrumentIdentity,
  type PortfolioProvider,
  type Holding,
} from "../../core/model";
import { jsonRequest, required, istExpiry } from "../http";
const base = "https://apiconnect.angelone.in";
async function request(path: string, token: string, body?: object) {
  const r = await jsonRequest(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-PrivateKey": required("ANGELONE_API_KEY"),
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": required("ANGELONE_LOCAL_IP"),
      "X-ClientPublicIP": required("ANGELONE_PUBLIC_IP"),
      "X-MACAddress": required("ANGELONE_MAC_ADDRESS"),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status !== true) {
    const expired = ["AG8001", "AG8002", "AB1010", "AB1007"].includes(
      r.errorcode,
    );
    throw new ProviderError(
      expired ? "SESSION_EXPIRED" : "UPSTREAM_ERROR",
      expired,
    );
  }
  return r.data;
}
const numeric = z
  .union([z.string().regex(/^-?\d+(\.\d+)?$/), z.number().finite()])
  .transform(String);
export function normalizeAngel(
  data: unknown,
  accountId: string,
  asOf: string,
): Holding[] {
  const rows = z
    .array(
      z.object({
        tradingsymbol: z.string(),
        exchange: z.string(),
        isin: z.string().optional(),
        symboltoken: z.string(),
        quantity: numeric,
        averageprice: numeric,
        ltp: numeric,
      }),
    )
    .parse(data);
  return rows.map((r) => ({
    accountId,
    source: "angelone",
    custodyBroker: "angelone",
    instrumentId: instrumentIdentity({
      isin: r.isin,
      exchange: r.exchange,
      id: r.symboltoken,
      ticker: r.tradingsymbol,
    }),
    isin: r.isin,
    ticker: r.tradingsymbol,
    name: r.tradingsymbol,
    exchange: r.exchange,
    assetClass: "Indian Equity",
    country: "IN",
    sector: "Unknown",
    currency: "INR",
    quantity: r.quantity,
    averagePrice: r.averageprice,
    investedValue: new Decimal(r.quantity).times(r.averageprice).toFixed(),
    marketPrice: r.ltp,
    marketValue: new Decimal(r.quantity).times(r.ltp).toFixed(),
    asOf,
    identityVerified: true,
  }));
}
export const angelone: PortfolioProvider = {
  id: "angelone",
  async connect(state, callback) {
    const url = new URL("https://smartapi.angelone.in/publisher-login");
    url.search = new URLSearchParams({
      api_key: required("ANGELONE_API_KEY"),
      redirect_url: callback,
      state,
    }).toString();
    return { url: url.href };
  },
  async exchange(params) {
    const token = params.get("auth_token");
    if (!token) throw new ProviderError("SESSION_EXPIRED", true);
    const profile = z
      .object({ clientcode: z.string() })
      .parse(
        await request("/rest/secure/angelbroking/user/v1/getProfile", token),
      );
    return {
      accessToken: token,
      refreshToken: params.get("refresh_token") || undefined,
      accountId: profile.clientcode,
      expiresAt: istExpiry(0),
    };
  },
  async refresh(auth) {
    if (!auth.refreshToken) throw new ProviderError("SESSION_EXPIRED", true);
    const data = z
      .object({ jwtToken: z.string(), refreshToken: z.string() })
      .parse(
        await request(
          "/rest/auth/angelbroking/jwt/v1/generateTokens",
          auth.accessToken,
          { refreshToken: auth.refreshToken },
        ),
      );
    return {
      ...auth,
      accessToken: data.jwtToken,
      refreshToken: data.refreshToken,
      expiresAt: istExpiry(0),
    };
  },
  async fetch(auth) {
    const profile = z
      .object({ clientcode: z.string() })
      .parse(
        await request(
          "/rest/secure/angelbroking/user/v1/getProfile",
          auth.accessToken,
        ),
      );
    if (auth.accountId && auth.accountId !== profile.clientcode)
      throw new ProviderError("INVALID_PAYLOAD");
    const data = z
      .object({ holdings: z.array(z.unknown()) })
      .parse(
        await request(
          "/rest/secure/angelbroking/portfolio/v1/getAllHolding",
          auth.accessToken,
        ),
      );
    const positions = await request(
      "/rest/secure/angelbroking/order/v1/getPosition",
      auth.accessToken,
    );
    const asOf = new Date().toISOString();
    const accountId = `angelone:${profile.clientcode}`;
    return {
      provider: "angelone",
      version: "smartapi-v1",
      asOf,
      accounts: [
        {
          id: accountId,
          providerAccountId: profile.clientcode,
          currency: "INR",
          type: "brokerage",
        },
      ],
      holdings: normalizeAngel(data.holdings, accountId, asOf),
      positions: normalizePositions(positions, "angelone", accountId, asOf),
      cash: [],
      transactions: [],
      coverage: {
        holdings: "complete",
        positions: "complete",
        cash: "unavailable",
        transactions: "unavailable",
      },
    };
  },
};
