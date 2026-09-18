import { z } from "zod";
import { ProviderError, type PortfolioProvider } from "../../core/model";
import { normalizeZerodha } from "./normalize";
import { openKite } from "./mcp";
import { kiteCash } from "./cash";
const profileSchema = z.object({ user_id: z.string().min(1) });
export const zerodha: PortfolioProvider = {
  id: "zerodha",
  async connect() {
    const client = await openKite();
    try {
      const url = await client.login();
      const sessionId = client.sessionId();
      if (!sessionId) throw new ProviderError("INVALID_PAYLOAD");
      return { url, context: { sessionId } };
    } finally {
      await client.close();
    }
  },
  async exchange(_params, _callback, context) {
    const sessionId = z.string().min(1).parse(context.sessionId);
    const client = await openKite(sessionId);
    try {
      const profile = profileSchema.parse(await client.read("get_profile"));
      return {
        accessToken: sessionId,
        accountId: profile.user_id,
        metadata: { transport: "kite-mcp" },
      };
    } finally {
      await client.close();
    }
  },
  async refresh() {
    throw new ProviderError("SESSION_EXPIRED", true);
  },
  async fetch(auth) {
    if (auth.metadata?.transport !== "kite-mcp")
      throw new ProviderError("SESSION_EXPIRED", true);
    const client = await openKite(auth.accessToken);
    try {
      const profile = profileSchema.parse(await client.read("get_profile"));
      if (!auth.accountId || profile.user_id !== auth.accountId)
        throw new ProviderError("INVALID_PAYLOAD");
      const holdings = await client.read("get_holdings");
      const funds = await client.read("get_mf_holdings");
      const asOf = new Date().toISOString();
      const accountId = `zerodha:${profile.user_id}`;
      const cash = kiteCash(await client.read("get_margins"), accountId, asOf);
      const normalized = normalizeZerodha(holdings, accountId, asOf);
      const mf = z
        .array(
          z.object({
            tradingsymbol: z.string().min(1),
            fund: z.string().min(1),
            quantity: z.number().finite().nonnegative(),
            average_price: z.number().finite().nonnegative(),
            last_price: z.number().finite().nonnegative(),
            last_price_date: z.string().optional(),
          }),
        )
        .parse(funds);
      for (const f of mf) {
        const isin = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(f.tradingsymbol)
          ? f.tradingsymbol
          : undefined;
        if (isin && normalized.some((h) => h.isin === isin))
          throw new ProviderError("INVALID_PAYLOAD");
        normalized.push(
          ...normalizeZerodha(
            [{ ...f, exchange: "BSEMF", instrument_token: 0, isin }],
            accountId,
            asOf,
          ).map((h) => ({
            ...h,
            instrumentId: isin ? `isin:${isin}` : `BSEMF:${f.tradingsymbol}`,
            name: f.fund,
            assetClass: "Mutual Fund",
            asOf:
              f.last_price_date && /^\d{4}-\d{2}-\d{2}$/.test(f.last_price_date)
                ? f.last_price_date + "T00:00:00.000Z"
                : asOf,
          })),
        );
      }
      return {
        provider: "zerodha",
        version: "kite-mcp-v1",
        asOf,
        accounts: [
          {
            id: accountId,
            providerAccountId: profile.user_id,
            currency: "INR",
            type: "brokerage",
          },
          ...cash.map((c) => ({
            id: c.accountId,
            providerAccountId: c.accountId,
            currency: "INR",
            type: "cash",
          })),
        ],
        holdings: normalized,
        positions: [],
        cash,
        transactions: [],
        coverage: {
          holdings: "complete",
          positions: "unavailable",
          cash: "complete",
          transactions: "unavailable",
        },
        observationNote:
          "Holdings retrieved through official Kite MCP. Cash uses each enabled segment's reported available.live_balance, not collateral-inclusive net margins or a verified withdrawable balance. Net positions are not included. Retrieval time is not a live-price timestamp; mutual fund NAV dates are preserved when supplied.",
      };
    } finally {
      await client.close();
    }
  },
};
