import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { proposals } from "../db/schema";
import { eq, desc } from "drizzle-orm";

export const proposalRouter = createRouter({
  create: publicQuery
    .input(
      z.object({
        proposalType: z.enum(["quick", "full"]),
        prospectName: z.string().min(1),
        prospectEmail: z.string().email().optional(),
        prospectLinkedin: z.string().optional(),
        prospectCompany: z.string().optional(),
        selectedOfferings: z.array(z.string()).optional(),
        suggestedAngle: z.string().optional(),
        includeOverview: z.boolean().optional(),
        includeCaseStudies: z.boolean().optional(),
        otherNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const result = await db.insert(proposals).values({
        ...input,
        status: "draft",
      });
      const id = Number(result[0].insertId);
      return { id };
    }),

  list: publicQuery.query(async () => {
    const db = getDb();
    return db.select().from(proposals).orderBy(desc(proposals.createdAt));
  }),

  getById: publicQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const results = await db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.id))
        .limit(1);
      return results[0] ?? null;
    }),

  update: publicQuery
    .input(
      z.object({
        id: z.number(),
        researchNotes: z.string().optional(),
        generatedPptdPath: z.string().optional(),
        status: z.enum(["draft", "generating", "ready", "sent"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...updates } = input;
      await db
        .update(proposals)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(proposals.id, id));
      return { success: true };
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(proposals).where(eq(proposals.id, input.id));
      return { success: true };
    }),
});
