import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "fs";
import { join } from "path";

const TEMP_DIR = "/tmp/brinc-convert";

export const converterRouter = createRouter({
  pptdToPptx: publicQuery
    .input(
      z.object({
        pptdBase64: z.string(),
        fileName: z.string().default("proposal.pptx"),
      })
    )
    .mutation(async ({ input }) => {
      const workDir = join(TEMP_DIR, `${Date.now()}`);
      mkdirSync(workDir, { recursive: true });

      try {
        // Decode and write the .pptd file
        const pptdPath = join(workDir, "proposal.pptd");
        writeFileSync(pptdPath, Buffer.from(input.pptdBase64, "base64"));

        // Extract any embedded pages/pages references
        // The .pptd references page files relative to its directory
        // We need to handle this — for now, convert directly
        const pptxPath = join(workDir, input.fileName);

        // Run conversion
        execSync(
          `/app/.agents/skills/pptx/scripts/runtime/kimi_pptd convert "${pptdPath}" -o "${pptxPath}"`,
          { timeout: 60000 }
        );

        // Read the generated .pptx
        const pptxData = readFileSync(pptxPath);
        const base64Pptx = pptxData.toString("base64");

        // Cleanup
        rmSync(workDir, { recursive: true, force: true });

        return { base64Pptx, fileName: input.fileName };
      } catch (error: any) {
        console.error("Conversion error:", error);
        throw new Error(`PPTD to PPTX conversion failed: ${error.message}`);
      }
    }),

  screenshotPptx: publicQuery
    .input(z.object({ pptxBase64: z.string() }))
    .mutation(async ({ input }) => {
      const workDir = join(TEMP_DIR, `screenshot_${Date.now()}`);
      mkdirSync(workDir, { recursive: true });

      try {
        const pptxPath = join(workDir, "input.pptx");
        const previewDir = join(workDir, "previews");
        mkdirSync(previewDir, { recursive: true });

        writeFileSync(pptxPath, Buffer.from(input.pptxBase64, "base64"));

        execSync(
          `/app/.agents/skills/pptx/scripts/runtime/kimi_pptd screenshot "${pptxPath}" -o "${previewDir}/"`,
          { timeout: 60000 }
        );

        const previews = readdirSync(previewDir)
          .filter((f) => f.endsWith(".png"))
          .map((f) => ({
            slideNumber: parseInt(f.match(/(\d+)/)?.[0] || "0"),
            base64: readFileSync(join(previewDir, f)).toString("base64"),
          }));

        rmSync(workDir, { recursive: true, force: true });
        return { previews };
      } catch (error: any) {
        console.error("Screenshot error:", error);
        throw new Error(`Screenshot generation failed: ${error.message}`);
      }
    }),
});
