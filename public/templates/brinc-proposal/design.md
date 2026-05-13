# Brinc Proposal Template — Design Document

## 1. Profile Baseline Declaration

- **Profile selection**: `profiles/strategic.md`
- **Selection rationale**: Brinc proposals are strategic partnership documents aimed at government entities, corporates, and ecosystem partners. The strategic profile aligns with the persuasion-driven, returns-oriented nature of these documents.
- **Referenced dimensions**: Narrative framework (Problem → Solution → Track Record → Approach → Next Steps), information density (medium), font hierarchy, content expression techniques
- **Deviation notes**: 
  - Slightly lower density than typical strategic reports — Brinc decks prioritize clarity and visual breathing room
  - More emphasis on relationship/context than raw data
  - Human, conversational tone rather than purely analytical

## 2. Style Baseline Declaration

- **Style anchor**: McKinsey/BCG consulting style + Sequoia Capital pitch deck clarity + Brinc's own brand identity (dark navy, clean, authoritative)
- **Referenced dimensions**: From consulting style — structured argumentation, clean grid layouts, professional color restraint. From Brinc brand — dark navy dominance, minimal decoration, focus on substance
- **Reference scope**: Style + color scheme + layout

## 3. Extract Style from Reference Source

### Typographic Character
Premium business — restrained, authoritative, modern. Clean lines, generous whitespace, strategic use of navy accents against white.

### Color Extraction
- **primary**: `#1B2A4A` — Brinc navy, used for headers, navigation, key visual anchors, cover backgrounds
- **secondary**: `#4A6FA5` — Lighter navy for secondary elements, links, subtle accents
- **accent**: `#E8A838` — Warm gold/amber for emphasis, key numbers, CTAs (used sparingly)
- **background**: `#FFFFFF` — Clean white for content pages
- **text**: `#2D3748` — Dark charcoal for body text

### Font Hierarchy
- **Titles**: Liter Bold, 28-36px, uppercase with letter spacing for cover/page titles
- **Body**: Liter Regular, 18-20px, clear and readable
- **Big numbers**: Liter Bold, 44-56px for stats/impact numbers
- **Annotations**: Liter Regular, 14px, #718096

### Container Styles
- Sharp-cornered rectangles (no rounded corners) — conveys rigor
- Content separation: whitespace + thin horizontal lines (#E2E8F0)
- No card shadows — flat, modern aesthetic

### Image Style
- Icons: Solid (fas), monochrome in primary navy
- Tables: Minimal three-line style, navy header
- Illustrations: High-quality photography with navy gradient masks for cover/chapter pages

## 4. Layout System

### Global Layout
- Page size: 1280x720 (16:9)
- Margins: 60px left/right, 50px top/bottom
- Logo: Top-left on all pages
- Page number: Bottom-right, 14px, #718096

### Special Pages
- Cover: Full navy background, large white title, subtitle, date, confidentiality notice
- Final: Navy background, clean CTA with next steps

### Content Pages
- Title at top (28-32px, navy, bold)
- Content area: single column or two-column layouts
- Bullet points with custom navy square markers
- Key stats highlighted in large numbers

## 5. Style Usage Rules
- `$title` style: Cover titles, page titles — Liter Bold, primary color
- `$subtitle`: Cover subtitles, section headers — Liter, secondary color, 22px
- `$body`: All body content — Liter, text color, 18px, 1.6 line height
- `$stat`: Big impact numbers — Liter Bold, 48px, accent color
- `$caption`: Annotations, sources — Liter, 14px, #718096

## 6. Risk Prohibitions
- No rounded rectangles — use sharp corners for authority
- No gradient backgrounds on content pages — solid white only
- No more than 5-6 bullet points per slide
- No AI-sounding bullet-stacking — use narrative flow
- Body font never below 18px
- No decorative flourishes, keep it clean

## 7. Theme Definition

```yaml
theme:
  colors:
    primary: "#1B2A4A"
    secondary: "#4A6FA5"
    accent: "#E8A838"
    background: "#FFFFFF"
    text: "#2D3748"
    lightgray: "#F7FAFC"
    midgray: "#E2E8F0"
    caption: "#718096"
  textStyles:
    title:
      fontSize: 32
      color: "$primary"
      fontFamily: "Liter"
      letterSpacing: 1
    subtitle:
      fontSize: 22
      color: "$secondary"
      fontFamily: "Liter"
      lineHeight: 1.4
    body:
      fontSize: 18
      color: "$text"
      fontFamily: "Liter"
      lineHeight: 1.6
    stat:
      fontSize: 48
      color: "$accent"
      fontFamily: "Liter"
    caption:
      fontSize: 14
      color: "$caption"
      fontFamily: "Liter"
      lineHeight: 1.4
  tableStyles:
    default:
      headerFill: "$primary"
      headerColor: "#FFFFFF"
      headerBold: true
      bodyFill: ["#FFFFFF", "$lightgray"]
      bodyColor: "$text"
      border:
        style: solid
        width: 1
        color: "$midgray"
```
