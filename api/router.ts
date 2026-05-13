import { createRouter, publicQuery } from "./middleware";
import { proposalRouter } from "./proposals";
import { slideLibraryRouter } from "./slide-library";
import { googleRouter } from "./google";
import { converterRouter } from "./converter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  proposal: proposalRouter,
  slideLibrary: slideLibraryRouter,
  google: googleRouter,
  converter: converterRouter,
});

export type AppRouter = typeof appRouter;
