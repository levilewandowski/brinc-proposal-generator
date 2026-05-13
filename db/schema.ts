import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  json,
  boolean,
} from "drizzle-orm/mysql-core";

export const proposals = mysqlTable("proposals", {
  id: serial("id").primaryKey(),
  proposalType: varchar("proposal_type", { length: 20 }).notNull(),
  prospectName: varchar("prospect_name", { length: 255 }).notNull(),
  prospectEmail: varchar("prospect_email", { length: 255 }),
  prospectLinkedin: varchar("prospect_linkedin", { length: 500 }),
  prospectCompany: varchar("prospect_company", { length: 255 }),
  selectedOfferings: json("selected_offerings").$type<string[]>(),
  suggestedAngle: text("suggested_angle"),
  includeOverview: boolean("include_overview").default(false),
  includeCaseStudies: boolean("include_case_studies").default(false),
  otherNotes: text("other_notes"),
  researchNotes: text("research_notes"),
  generatedPptdPath: varchar("generated_pptd_path", { length: 500 }),
  googleSlidesUrl: varchar("google_slides_url", { length: 500 }),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const slideLibrary = mysqlTable("slide_library", {
  id: serial("id").primaryKey(),
  deckName: varchar("deck_name", { length: 255 }).notNull(),
  pageNumber: varchar("page_number", { length: 10 }).notNull(),
  pageContent: text("page_content").notNull(), // the .page YAML
  previewImagePath: varchar("preview_image_path", { length: 500 }),
  slideTitle: varchar("slide_title", { length: 255 }),
  slideContent: text("slide_content"), // extracted text for search
  offeringTags: json("offering_tags").$type<string[]>(),
  sectorTags: json("sector_tags").$type<string[]>(),
  isGlobal: boolean("is_global").default(false),
  isTemplate: boolean("is_template").default(false), // built-in template slides
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const googleCredentials = mysqlTable("google_credentials", {
  id: serial("id").primaryKey(),
  userIdentifier: varchar("user_identifier", { length: 255 }).notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
