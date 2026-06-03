# PPTX Slide Merge Validation Prototype

Isolated proof-of-concept for PPTX-first slide assembly.

## What This Proves

- Load a source PPTX file
- Extract a specific slide by index
- Merge it into a new target PPTX
- Preserve shapes, images, text formatting, and media
- Export a valid PPTX

## Files

| File | Purpose |
|------|---------|
| `validate-pptx-merge.js` | Main validation script — inspects, extracts, merges, checks fidelity |
| `generate-test-pptx.js` | Creates a test PPTX with shapes, text, and an embedded image |
| `output/` | Generated files (created on run) |

## Quick Start

### 1. Test with generated synthetic PPTX

```bash
cd prototype
node generate-test-pptx.js        # Creates output/test_canonical.pptx
node validate-pptx-merge.js output/test_canonical.pptx 0
```

Expected output: all fidelity checks pass (shapes, images, text, media).

### 2. Test with real canonical_why_brinc.pptx from Google Drive

```bash
cd prototype
ACCESS_TOKEN=<google_oauth_token> \
FILE_ID=<canonical_why_brinc_file_id> \
node validate-pptx-merge.js
```

Get the file ID from the canonical components folder in Google Drive.

### 3. Test with a local PPTX file

```bash
cd prototype
node validate-pptx-merge.js /path/to/your/file.pptx [slideIndex]
```

## Fidelity Check Output

The script reports:

- **Shape counts**: Number of `<p:sp>` elements (text boxes, rectangles, etc.)
- **Image counts**: Number of `<p:pic>` elements (embedded images)
- **Element counts match**: YES if source and output counts match
- **Media references**: External files (images, audio, video) referenced by the slide
- **Media presence**: Whether each referenced file exists in the output
- **Slide layout reference**: Whether layout relationship is preserved
- **Text content match**: YES if all text content is identical between source and output

## Architecture Notes

### How the merge works

1. **Inspect source PPTX**: List all files (slides, media, layouts, masters, themes, rels)
2. **Extract slide**: Read presentation.xml to find the slide's relationship ID, resolve to a file path
3. **Read slide XML + rels**: Get the slide content and its relationship file
4. **Create target PPTX**: Build a minimal valid PPTX structure (blank slide + layout + master + theme)
5. **Merge**: Copy slide XML, slide rels, and all referenced media into the target
6. **Update presentation.xml**: Add the new slide to the slide order list
7. **Update presentation.xml.rels**: Add a relationship pointing to the new slide
8. **Update [Content_Types].xml**: Register the new slide's content type
9. **Fidelity check**: Compare element counts, media presence, and text content

### Known limitations of this naive approach

- **Slide layouts**: The copied slide still references its original layout (from the source PPTX). The target PPTX has its own layout. PowerPoint will handle this gracefully, but layout consistency across merged slides is not guaranteed.
- **Slide masters**: Same as layouts — each source slide may reference a different master.
- **Themes**: Colors and fonts may differ if source slides use different themes.
- **Duplicate media**: If two source slides reference the same image filename, the second copy will overwrite the first.

### Production approach

These limitations are solvable:

1. **Collect all layouts/masters/themes** from source PPTX files
2. **Deduplicate** them (same layout = keep one)
3. **Renumber** all relationship IDs to avoid conflicts
4. **Build a unified theme** from a designated "master" source
5. **Update all slide XML** to point to the unified layout/theme

This is the next phase of work after validation confirms the core approach.

## Dependencies

- `jszip` — ZIP read/write (PPTX is a ZIP archive)
- `fast-xml-parser` — XML parse and stringify

Installed automatically by `npm install` in the prototype directory.

## Next Steps

After validating with `canonical_why_brinc.pptx`:

1. Confirm the merged PPTX opens correctly in PowerPoint / LibreOffice / Google Slides
2. If fidelity is acceptable, begin Phase 1: replace the Google Slides renderer with PPTX assembly
3. The production renderer will need: layout deduplication, theme unification, and batch slide merging
