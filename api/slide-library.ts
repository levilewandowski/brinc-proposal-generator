import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { slideLibrary } from "../db/schema";
import { eq, like, desc, and, or } from "drizzle-orm";
import { execSync } from "child_process";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const TEMP_DIR = "/tmp/brinc-slides";
const PREVIEW_DIR = "/mnt/agents/output/app/public/previews";

if (!existsSync(PREVIEW_DIR)) mkdirSync(PREVIEW_DIR, { recursive: true });

export const slideLibraryRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        offering: z.string().optional(),
        sector: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const filters = [];

      if (input?.offering) {
        filters.push(like(slideLibrary.offeringTags, `%${input.offering}%`));
      }
      if (input?.sector) {
        filters.push(like(slideLibrary.sectorTags, `%${input.sector}%`));
      }
      if (input?.search) {
        filters.push(
          or(
            like(slideLibrary.slideTitle, `%${input.search}%`),
            like(slideLibrary.slideContent, `%${input.search}%`),
            like(slideLibrary.deckName, `%${input.search}%`)
          )
        );
      }

      if (filters.length > 0) {
        return db.select().from(slideLibrary).where(and(...filters)).orderBy(desc(slideLibrary.createdAt));
      }
      return db.select().from(slideLibrary).orderBy(desc(slideLibrary.createdAt));
    }),

  uploadDeck: publicQuery
    .input(
      z.object({
        fileName: z.string(),
        base64Data: z.string(), // base64 encoded .pptx
        offeringTags: z.array(z.string()).optional(),
        sectorTags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const workDir = join(TEMP_DIR, `${Date.now()}`);
      mkdirSync(workDir, { recursive: true });

      const pptxPath = join(workDir, input.fileName);
      const previewDir = join(workDir, "previews");

      try {
        // Write the uploaded file
        writeFileSync(pptxPath, Buffer.from(input.base64Data, "base64"));

        // Convert .pptx to .pptd (extracts pages)
        execSync(
          `/app/.agents/skills/pptx/scripts/runtime/kimi_pptd convert "${pptxPath}" -o "${workDir}/"`,
          { timeout: 30000 }
        );

        // Take screenshots for previews
        execSync(
          `/app/.agents/skills/pptx/scripts/runtime/kimi_pptd screenshot "${pptxPath}" -o "${previewDir}/"`,
          { timeout: 30000 }
        );

        // Read extracted .page files
        const pptdFile = readdirSync(workDir).find(f => f.endsWith(".pptd"));
        if (!pptdFile) throw new Error("No .pptd file generated");

        const pptdContent = readFileSync(join(workDir, pptdFile), "utf-8");
        const pagesMatch = pptdContent.match(/pages:\s*\n((?:\s+-\s+.+\n?)+)/);
        const pageFiles = pagesMatch
          ? pagesMatch[1].match(/-\s+(.+)/g)?.map(m => m.replace(/^-\s+/, "").trim()) || []
          : [];

        const previewFiles = readdirSync(previewDir).filter(f => f.endsWith(".png"));
        const insertedIds = [];

        for (let i = 0; i < pageFiles.length; i++) {
          const pagePath = join(workDir, pageFiles[i]);
          if (!existsSync(pagePath)) continue;

          const pageContent = readFileSync(pagePath, "utf-8");
          const previewFile = previewFiles[i] || previewFiles[0];

          // Copy preview to public
          const publicPreviewPath = join(PREVIEW_DIR, `${Date.now()}_${i}.png`);
          if (previewFile && existsSync(join(previewDir, previewFile))) {
            const previewData = readFileSync(join(previewDir, previewFile));
            writeFileSync(publicPreviewPath, previewData);
          }

          // Extract title from page
          const titleMatch = pageContent.match(/text:\s*\|\s*\n\s*<p><strong>(.+?)<\/strong><\/p>/);
          const contentMatch = pageContent.match(/text:\s*\|\s*\n([\s\S]*?)(?:\n  \w+:|$)/);

          const result = await db.insert(slideLibrary).values({
            deckName: input.fileName.replace(".pptx", ""),
            pageNumber: String(i + 1),
            pageContent,
            previewImagePath: publicPreviewPath.replace("/mnt/agents/output/app/public", ""),
            slideTitle: titleMatch ? titleMatch[1] : `Slide ${i + 1}`,
            slideContent: contentMatch ? contentMatch[1].substring(0, 2000) : "",
            offeringTags: input.offeringTags || [],
            sectorTags: input.sectorTags || [],
            isGlobal: false,
            isTemplate: false,
            createdBy: "team",
          });
          insertedIds.push(Number(result[0].insertId));
        }

        return { success: true, extractedSlides: pageFiles.length, slideIds: insertedIds };
      } catch (error: any) {
        console.error("Upload error:", error);
        throw new Error(`Failed to process deck: ${error.message}`);
      }
    }),

  updateTags: publicQuery
    .input(
      z.object({
        id: z.number(),
        offeringTags: z.array(z.string()).optional(),
        sectorTags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const { id, ...updates } = input;
      await db.update(slideLibrary).set(updates).where(eq(slideLibrary.id, id));
      return { success: true };
    }),

  delete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.delete(slideLibrary).where(eq(slideLibrary.id, input.id));
      return { success: true };
    }),
});
