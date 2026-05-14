import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Library,
  RefreshCw,
  FileText,
  FolderOpen,
  Folder,
  Search,
  Filter,
  Grid3X3,
  List,
  Dna,
  CopyCheck,
  AlertTriangle,
  Image,
  BarChart3,
  Layers,
  CheckCircle2,
  HeartPulse,
  ShieldCheck,
  ShieldAlert,
  ArrowUpCircle,
} from "lucide-react";

interface SlideIndexEntry {
  slideId: string;
  slideType: string;
  sectionTag: string;
  text: string;
  layout: string;
  confidence: number;
  sourceDeck: string;
  sourceFolder: string;
  sourcePresentationId: string;
  modifiedTime: string;
}

interface DNADetectedComponent {
  type: string;
  confidence: number;
}

interface DNAEntry {
  slideId: string;
  slideType: string;
  archetype: string;
  sourceDeck: string;
  sourcePresentationId: string;
  detectedComponents: DNADetectedComponent[];
  componentSignature: string;
  layoutFingerprint: {
    elementCount: number;
    textElementCount: number;
    hasDivider: boolean;
    hasImage: boolean;
    avgFontSize: number;
  };
}

interface FileStatus {
  name: string;
  folder: string;
  presentationId?: string;
  status: string;
  slideCount: number;
  dnaCount: number;
  archetype?: string;
  cloneable: boolean;
}

interface DeckProfile {
  fileName: string;
  folder: string;
  presentationId: string;
  slideCount: number;
  archetype: string;
  slides: SlideIndexEntry[];
  slideDNA: DNAEntry[];
}

interface ScanResult {
  ok: boolean;
  totalPptxFiles: number;
  scannedFiles: number;
  fileList: Array<{ folder: string; name: string; modifiedTime: string }>;
  deckProfiles: DeckProfile[];
  archetypeBreakdown: Record<string, number>;
  slideTypeCounts: Record<string, number>;
  layoutPreferences: Record<string, number>;
  slideIndex: { slideCount: number; deckCount: number };
  dnaIndex: { slideCount: number; componentCounts: Record<string, number> };
  availableFolders?: string[];
  allChildrenCount?: number;
  workspace?: {
    rootFolderName: string;
    rootFolderId: string;
    isAutoCorrected: boolean;
    correctionReason: string;
    rawRootName: string;
    rawRootId: string;
  };
  fileStatuses?: FileStatus[];
  logs: string[];
}

interface WorkspaceHealth {
  ok: boolean;
  healthy: boolean;
  workspace: {
    rootFolderName: string;
    rootFolderId: string;
    rootFolderPath: string;
    isAutoCorrected: boolean;
    correctionReason: string;
    rawRootName: string;
    rawRootId: string;
  };
  summary: {
    totalChildren: number;
    requiredFoldersPresent: number;
    requiredFoldersMissing: number;
    optionalFoldersPresent: number;
    folderNames: string[];
  };
  requiredFolders: {
    present: string[];
    missing: string[];
  };
  optionalFolders: {
    present: string[];
    missing: string[];
  };
  pptxFiles: Record<string, { folderName: string; folderId: string; count: number }>;
  diagnostics: string[];
  apiLogs?: string[];
}

const SLIDE_TYPE_COLORS: Record<string, string> = {
  cover: "bg-[#1B2A4A] text-white",
  title_sentence: "bg-blue-600 text-white",
  executive_summary: "bg-emerald-600 text-white",
  challenge_framing: "bg-amber-600 text-white",
  objectives: "bg-violet-600 text-white",
  approach: "bg-rose-600 text-white",
  scouting: "bg-cyan-600 text-white",
  timeline: "bg-indigo-600 text-white",
  case_study: "bg-teal-600 text-white",
  why_brinc: "bg-fuchsia-600 text-white",
  next_steps: "bg-lime-600 text-white",
  ecosystem: "bg-sky-600 text-white",
  reporting: "bg-orange-600 text-white",
  team: "bg-pink-600 text-white",
  metrics: "bg-red-600 text-white",
  content: "bg-slate-500 text-white",
};

const COMPONENT_COLORS: Record<string, string> = {
  navy_cover: "bg-[#1B2A4A]",
  title_sentence: "bg-blue-500",
  section_header: "bg-emerald-500",
  two_column: "bg-amber-500",
  metrics_grid: "bg-violet-500",
  timeline: "bg-cyan-500",
  case_study_card: "bg-teal-500",
  image_slide: "bg-rose-500",
  text_content: "bg-slate-400",
};

export default function SlideLibrary() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterText, setFilterText] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterArchetype, setFilterArchetype] = useState<string>("");
  const [selectedDeck, setSelectedDeck] = useState<string>("");
  const [health, setHealth] = useState<WorkspaceHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const accessToken = localStorage.getItem("brinc_google_access_token");

  const handleScan = async () => {
    if (!accessToken) {
      toast.error("Please connect your Google account first");
      return;
    }
    try {
      setScanning(true);
      toast.info("Scanning source decks and templates...");
      const res = await fetch(
        "/api/google/library?accessToken=" + encodeURIComponent(accessToken)
      );
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Scan failed");
      }
      setScanResult(data);
      toast.success(
        `Scanned ${data.scannedFiles || 0} file(s), indexed ${data.slideIndex?.slideCount || 0} slides`
      );
    } catch (err: any) {
      console.error("[Library Scan] Error:", err);
      toast.error("Scan failed: " + (err.message || String(err)));
    } finally {
      setScanning(false);
    }
  };

  const checkWorkspaceHealth = async () => {
    if (!accessToken) {
      toast.error("Please connect your Google account first");
      return;
    }
    try {
      setCheckingHealth(true);
      const res = await fetch(
        "/api/google/workspace-health?accessToken=" + encodeURIComponent(accessToken)
      );
      const data = await res.json();
      setHealth(data);
      if (data.workspace?.isAutoCorrected) {
        toast.success("Workspace auto-corrected: " + data.workspace.correctionReason);
      } else if (data.healthy) {
        toast.success("Workspace healthy: " + data.workspace.rootFolderName);
      } else {
        toast.warning("Workspace issue detected — check diagnostics");
      }
    } catch (err: any) {
      toast.error("Health check failed: " + (err.message || String(err)));
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (accessToken && !health) {
      checkWorkspaceHealth();
    }
  }, [accessToken]);

  // Flatten all slides from deck profiles
  const allSlides = useMemo(() => {
    if (!scanResult?.deckProfiles) return [];
    const slides: Array<{
      slide: SlideIndexEntry;
      dna: DNAEntry | null;
      deck: DeckProfile;
    }> = [];
    scanResult.deckProfiles.forEach((deck) => {
      deck.slides.forEach((slide) => {
        const dna =
          deck.slideDNA?.find((d) => d.slideId === slide.slideId) || null;
        slides.push({ slide, dna, deck });
      });
    });
    return slides;
  }, [scanResult]);

  // Extract unique filter values
  const allSlideTypes = useMemo(() => {
    const types = new Set<string>();
    allSlides.forEach((s) => types.add(s.slide.slideType));
    return Array.from(types).sort();
  }, [allSlides]);

  const allArchetypes = useMemo(() => {
    const archs = new Set<string>();
    allSlides.forEach((s) => archs.add(s.deck.archetype));
    return Array.from(archs).sort();
  }, [allSlides]);

  const allDecks = useMemo(() => {
    const decks = new Set<string>();
    allSlides.forEach((s) => decks.add(s.deck.fileName));
    return Array.from(decks).sort();
  }, [allSlides]);

  // Apply filters
  const filteredSlides = useMemo(() => {
    return allSlides.filter(({ slide, dna, deck }) => {
      if (filterText) {
        const ft = filterText.toLowerCase();
        const textMatch = slide.text?.toLowerCase().includes(ft);
        const deckMatch = deck.fileName.toLowerCase().includes(ft);
        const typeMatch = slide.slideType.toLowerCase().includes(ft);
        if (!textMatch && !deckMatch && !typeMatch) return false;
      }
      if (filterType && slide.slideType !== filterType) return false;
      if (filterArchetype && deck.archetype !== filterArchetype) return false;
      if (selectedDeck && deck.fileName !== selectedDeck) return false;
      return true;
    });
  }, [allSlides, filterText, filterType, filterArchetype, selectedDeck]);

  // Stats
  const cloneableCount = useMemo(
    () => allSlides.filter((s) => s.slide.sourcePresentationId).length,
    [allSlides]
  );

  const stats = useMemo(() => {
    if (!scanResult) return null;
    return {
      totalSlides: scanResult.slideIndex?.slideCount || 0,
      totalDecks: scanResult.slideIndex?.deckCount || 0,
      cloneable: cloneableCount,
      withDNA: scanResult.dnaIndex?.slideCount || 0,
      slideTypes: Object.keys(scanResult.slideTypeCounts || {}).length,
    };
  }, [scanResult, cloneableCount]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-lg font-bold text-[#1B2A4A]">BRINC</h1>
              <p className="text-xs text-slate-500">Slide Library Browser</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setViewMode(viewMode === "grid" ? "list" : "grid")
              }
              className="gap-2"
            >
              {viewMode === "grid" ? (
                <List className="w-4 h-4" />
              ) : (
                <Grid3X3 className="w-4 h-4" />
              )}
              {viewMode === "grid" ? "List" : "Grid"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={checkWorkspaceHealth}
              disabled={checkingHealth || !accessToken}
              className="gap-2"
            >
              {checkingHealth ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <HeartPulse className="w-4 h-4" />
              )}
              {checkingHealth ? "Checking..." : "Health"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScan}
              disabled={scanning || !accessToken}
              className="gap-2"
            >
              {scanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {scanning ? "Scanning..." : "Rescan Library"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {!accessToken ? (
          <Card className="border-dashed border-slate-300">
            <CardContent className="py-16 text-center">
              <Library className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">
                Connect Google to scan library
              </p>
              <p className="text-sm text-slate-400 mt-1">
                The library scans your 02 Source Decks and 03 Templates folders
              </p>
            </CardContent>
          </Card>
        ) : scanning && !scanResult ? (
          <Card className="border-dashed border-slate-300">
            <CardContent className="py-16 text-center">
              <Loader2 className="w-12 h-12 text-slate-300 mx-auto mb-4 animate-spin" />
              <p className="text-slate-500 font-medium">
                Scanning source decks and templates...
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Stats Bar */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard
                  icon={<Layers className="w-4 h-4" />}
                  label="Total Slides"
                  value={stats.totalSlides}
                />
                <StatCard
                  icon={<FileText className="w-4 h-4" />}
                  label="Decks"
                  value={stats.totalDecks}
                />
                <StatCard
                  icon={<CopyCheck className="w-4 h-4" />}
                  label="Cloneable"
                  value={stats.cloneable}
                  highlight={stats.cloneable > 0}
                />
                <StatCard
                  icon={<Dna className="w-4 h-4" />}
                  label="With DNA"
                  value={stats.withDNA}
                />
                <StatCard
                  icon={<BarChart3 className="w-4 h-4" />}
                  label="Slide Types"
                  value={stats.slideTypes}
                />
              </div>
            )}

            {/* File Processing Status */}
            {scanResult?.fileStatuses && scanResult.fileStatuses.length > 0 && (
              <Card className="border-slate-200">
                <CardContent className="py-4">
                  <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    File Processing Status ({scanResult.fileStatuses.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-200">
                          <th className="text-left py-1.5 pr-3">File</th>
                          <th className="text-left py-1.5 pr-3">Status</th>
                          <th className="text-right py-1.5 pr-3">Slides</th>
                          <th className="text-right py-1.5 pr-3">DNA</th>
                          <th className="text-left py-1.5">Presentation ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResult.fileStatuses.map((fs, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3">
                              <div className="flex items-center gap-1.5">
                                {fs.status === "indexed" ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3 text-red-400" />
                                )}
                                <span className="font-medium text-slate-700">{fs.name}</span>
                              </div>
                            </td>
                            <td className="py-1.5 pr-3">
                              <Badge className={`text-[10px] ${
                                fs.status === "indexed"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                  : "bg-red-100 text-red-600 border-red-300"
                              }`} variant="outline">
                                {fs.status}
                              </Badge>
                            </td>
                            <td className="text-right py-1.5 pr-3 text-slate-600">{fs.slideCount}</td>
                            <td className="text-right py-1.5 pr-3 text-slate-600">{fs.dnaCount}</td>
                            <td className="py-1.5 font-mono text-[10px] text-slate-400">
                              {fs.presentationId
                                ? fs.presentationId.substring(0, 16) + "..."
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Workspace Health */}
            {health && (
              <Card className={health.healthy ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/30"}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      {health.healthy ? (
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-amber-600" />
                      )}
                      <span className={health.healthy ? "text-emerald-800" : "text-amber-800"}>
                        Workspace Health
                      </span>
                    </h3>
                    {health.workspace?.isAutoCorrected && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs gap-1">
                        <ArrowUpCircle className="w-3 h-3" />
                        Auto-corrected
                      </Badge>
                    )}
                  </div>

                  {/* Raw DRIVE_ROOT display for debugging */}
                  {health.workspace?.rawRootId && (
                    <div className="bg-white rounded p-2.5 border border-slate-200 mb-3">
                      <p className="text-[10px] text-slate-500 font-medium">DRIVE_ROOT env var (raw)</p>
                      <p className="text-xs font-mono text-slate-700 break-all">{health.workspace.rawRootId}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Name: {health.workspace?.rawRootName || "?"}
                        {health.workspace?.isAutoCorrected && " → corrected to parent"}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="bg-white rounded p-2.5 border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-medium">Root Folder</p>
                      <p className="text-sm font-semibold text-[#1B2A4A] truncate">
                        {health.workspace?.rootFolderName || "?"}
                      </p>
                    </div>
                    <div className="bg-white rounded p-2.5 border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-medium">Total Children</p>
                      <p className="text-sm font-semibold text-[#1B2A4A]">
                        {health.summary?.totalChildren ?? "?"}
                      </p>
                    </div>
                    <div className="bg-white rounded p-2.5 border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-medium">Required</p>
                      <p className={`text-sm font-semibold ${health.summary?.requiredFoldersPresent === 3 ? "text-emerald-700" : "text-amber-700"}`}>
                        {health.summary?.requiredFoldersPresent ?? 0}/3 present
                      </p>
                    </div>
                    <div className="bg-white rounded p-2.5 border border-slate-200">
                      <p className="text-[10px] text-slate-500 font-medium">PPTX Files</p>
                      <p className="text-sm font-semibold text-[#1B2A4A]">
                        {Object.values(health.pptxFiles || {}).reduce((sum: number, f: any) => sum + (f.count || 0), 0)}
                      </p>
                    </div>
                  </div>

                  {/* Required Folders */}
                  <div className="space-y-1.5 mb-3">
                    <p className="text-xs font-medium text-slate-600">Required Folders</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["01 Generated Proposals", "02 Source Decks", "03 Templates"].map((name) => {
                        const isPresent = health.requiredFolders?.present?.includes(name);
                        const count = health.pptxFiles?.[name]?.count;
                        return (
                          <Badge
                            key={name}
                            className={`text-xs gap-1 ${
                              isPresent
                                ? "bg-emerald-100 text-emerald-700 border-emerald-300 border"
                                : "bg-red-100 text-red-600 border-red-300 border"
                            }`}
                            variant="outline"
                          >
                            {isPresent ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {name.replace(/^\d+ /, "")}
                            {count !== undefined && count > 0 && (
                              <span className="text-[10px] opacity-70">({count} PPTX)</span>
                            )}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  {/* Optional Folders */}
                  {health.optionalFolders?.present && health.optionalFolders.present.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      <p className="text-xs font-medium text-slate-600">Optional Folders</p>
                      <div className="flex flex-wrap gap-1.5">
                        {health.optionalFolders.present.map((name: string) => (
                          <Badge key={name} className="text-xs bg-slate-100 text-slate-600 border-slate-200 border" variant="outline">
                            {name.replace(/^\d+ /, "")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Diagnostics */}
                  {health.diagnostics && health.diagnostics.length > 0 && (
                    <div className="bg-white rounded p-2.5 border border-slate-200">
                      <p className="text-[10px] font-medium text-slate-500 mb-1">Diagnostics</p>
                      <div className="space-y-0.5">
                        {health.diagnostics.map((d: string, i: number) => (
                          <p key={i} className="text-[11px] text-slate-600 font-mono">{d}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fix instructions if DRIVE_ROOT is broken */}
                  {health.diagnostics?.some((d: string) => d.includes("Cannot access") || d.includes("error code")) && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1.5">How to fix:</p>
                      <ol className="text-[11px] text-red-600 space-y-1 list-decimal list-inside">
                        <li>Open your Google Drive and find the <strong>"LEVI KIMI"</strong> parent folder</li>
                        <li>Copy the folder ID from the URL (the part after <code>/folders/</code>)</li>
                        <li>Go to your Vercel dashboard → Project Settings → Environment Variables</li>
                        <li>Update <code>GOOGLE_DRIVE_FOLDER_ID</code> with the copied ID</li>
                        <li>Redeploy the project (or wait for auto-deploy)</li>
                      </ol>
                      <p className="text-[11px] text-red-500 mt-2">
                        Current value: <code className="bg-red-100 px-1 py-0.5 rounded">{health.workspace?.rawRootId || "?"}</code>
                      </p>
                    </div>
                  )}

                  {/* Correction notice */}
                  {health.workspace?.correctionReason && (
                    <div className="mt-2 text-[11px] text-amber-600 bg-amber-100 rounded p-2">
                      {health.workspace.correctionReason}
                    </div>
                  )}

                  {/* Debug Logs (collapsible) */}
                  {health.apiLogs && health.apiLogs.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">
                        API Debug Logs ({health.apiLogs.length} lines)
                      </summary>
                      <pre className="text-[10px] text-slate-500 overflow-auto max-h-64 mt-1 bg-slate-50 rounded p-2 border border-slate-100">
                        {health.apiLogs.join("\n")}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Discovered Folders */}
            {scanResult?.availableFolders && scanResult.availableFolders.length > 0 && (
              <Card className="border-slate-200">
                <CardContent className="py-4">
                  <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Discovered Folders under Drive Root
                    <span className="text-xs font-normal text-slate-400">
                      ({scanResult.availableFolders.length} of {scanResult.allChildrenCount || "?"} total children)
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {scanResult.availableFolders.map((name, i) => {
                      const isTarget = name === "02 Source Decks" || name === "03 Templates";
                      const isSystem = name === "06 Indexes" || name === "07 Template Library";
                      return (
                        <Badge
                          key={i}
                          className={`text-xs px-2.5 py-1 ${
                            isTarget
                              ? "bg-emerald-100 text-emerald-700 border-emerald-300 border gap-1"
                              : isSystem
                                ? "bg-slate-100 text-slate-500 border-slate-200 border"
                                : "bg-white text-slate-600 border-slate-200 border"
                          }`}
                          variant="outline"
                        >
                          {isTarget && <CheckCircle2 className="w-3 h-3" />}
                          {name}
                        </Badge>
                      );
                    })}
                  </div>
                  {(!scanResult.availableFolders.includes("02 Source Decks") ||
                    !scanResult.availableFolders.includes("03 Templates")) && (
                    <div className="mt-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded p-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        Expected folders not found.
                        {!scanResult.availableFolders.includes("02 Source Decks") && (
                          <span> Missing: <strong>02 Source Decks</strong></span>
                        )}
                        {!scanResult.availableFolders.includes("03 Templates") && (
                          <span> Missing: <strong>03 Templates</strong></span>
                        )}
                        <span className="block text-amber-500 mt-0.5">
                          These folders must exist in the connected Google Drive root folder.
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Filters */}
            <Card className="border-slate-200">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search slides..."
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="h-8 text-sm border border-slate-200 rounded px-2 bg-white"
                    >
                      <option value="">All Types</option>
                      {allSlideTypes.map((t) => (
                        <option key={t} value={t}>
                          {t.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterArchetype}
                      onChange={(e) => setFilterArchetype(e.target.value)}
                      className="h-8 text-sm border border-slate-200 rounded px-2 bg-white"
                    >
                      <option value="">All Archetypes</option>
                      {allArchetypes.map((a) => (
                        <option key={a} value={a}>
                          {a.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedDeck}
                      onChange={(e) => setSelectedDeck(e.target.value)}
                      className="h-8 text-sm border border-slate-200 rounded px-2 bg-white"
                    >
                      <option value="">All Decks</option>
                      {allDecks.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  {filterText || filterType || filterArchetype || selectedDeck ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFilterText("");
                        setFilterType("");
                        setFilterArchetype("");
                        setSelectedDeck("");
                      }}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Showing {filteredSlides.length} of {allSlides.length} indexed
                  slides
                  {cloneableCount > 0
                    ? ` · ${cloneableCount} cloneable`
                    : " · No cloneable slides — run a scan"}
                </p>
              </CardContent>
            </Card>

            {/* Slide Browser */}
            {filteredSlides.length === 0 ? (
              <Card className="border-dashed border-slate-300">
                <CardContent className="py-12 text-center">
                  <Image className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">
                    No slides match your filters
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    Try adjusting your search or filters
                  </p>
                </CardContent>
              </Card>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSlides.map(({ slide, dna, deck }, idx) => (
                  <SlideCard
                    key={`${deck.fileName}-${slide.slideId}-${idx}`}
                    slide={slide}
                    dna={dna}
                    deck={deck}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSlides.map(({ slide, dna, deck }, idx) => (
                  <SlideListItem
                    key={`${deck.fileName}-${slide.slideId}-${idx}`}
                    slide={slide}
                    dna={dna}
                    deck={deck}
                  />
                ))}
              </div>
            )}

            {/* File List */}
            {scanResult?.fileList && scanResult.fileList.length > 0 && (
              <Card className="border-slate-200">
                <CardContent className="py-4">
                  <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    Source Files ({scanResult.fileList.length})
                  </h3>
                  <div className="space-y-1.5">
                    {scanResult.fileList.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm py-1"
                      >
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <Badge variant="outline" className="text-xs shrink-0">
                          {f.folder}
                        </Badge>
                        <span className="text-slate-700 truncate">
                          {f.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Logs */}
            {scanResult?.logs && scanResult.logs.length > 0 && (
              <Card className="border-slate-200 bg-slate-50">
                <CardContent className="py-4">
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">
                    Scan Logs
                  </h3>
                  <pre className="text-xs text-slate-500 overflow-auto max-h-48">
                    {scanResult.logs.join("\n")}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`border-slate-200 ${highlight ? "ring-1 ring-emerald-400 bg-emerald-50/50" : ""}`}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 text-slate-500 mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p
          className={`text-2xl font-bold ${highlight ? "text-emerald-700" : "text-[#1B2A4A]"}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function SlideCard({
  slide,
  dna,
  deck,
}: {
  slide: SlideIndexEntry;
  dna: DNAEntry | null;
  deck: DeckProfile;
}) {
  const typeClass =
    SLIDE_TYPE_COLORS[slide.slideType] ||
    "bg-slate-500 text-white";
  const isCloneable = !!slide.sourcePresentationId;
  const textPreview = slide.text
    ? slide.text.substring(0, 120) +
      (slide.text.length > 120 ? "..." : "")
    : "No text content";

  return (
    <Card className="border-slate-200 hover:border-slate-300 transition-colors overflow-hidden">
      <CardContent className="p-0">
        {/* Thumbnail placeholder */}
        <div className="h-32 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center relative">
          <Image className="w-8 h-8 text-slate-300" />
          {isCloneable ? (
            <Badge className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] gap-1">
              <CopyCheck className="w-3 h-3" />
              Cloneable
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="absolute top-2 right-2 text-[10px] gap-1 text-amber-600 border-amber-300"
            >
              <AlertTriangle className="w-3 h-3" />
              No source
            </Badge>
          )}
          <Badge
            className={`absolute top-2 left-2 text-[10px] ${typeClass}`}
          >
            {slide.slideType.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
            {textPreview}
          </p>

          {/* DNA Components */}
          {dna?.detectedComponents && dna.detectedComponents.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {dna.detectedComponents.map((comp, i) => (
                <span
                  key={i}
                  className={`text-[10px] px-1.5 py-0.5 rounded text-white ${COMPONENT_COLORS[comp.type] || "bg-slate-400"}`}
                  title={`Confidence: ${Math.round(comp.confidence * 100)}%`}
                >
                  {comp.type.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-[10px] text-slate-500 truncate">
                {deck.fileName}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-[10px] px-1">
                {deck.archetype.replace(/_/g, " ")}
              </Badge>
              <span className="text-[10px] text-slate-400">
                {slide.layout}
              </span>
            </div>
          </div>

          {dna?.layoutFingerprint && (
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span>{dna.layoutFingerprint.elementCount} elements</span>
              <span>{dna.layoutFingerprint.textElementCount} text</span>
              <span>avg {dna.layoutFingerprint.avgFontSize}pt</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SlideListItem({
  slide,
  dna,
  deck,
}: {
  slide: SlideIndexEntry;
  dna: DNAEntry | null;
  deck: DeckProfile;
}) {
  const typeClass =
    SLIDE_TYPE_COLORS[slide.slideType] ||
    "bg-slate-500 text-white";
  const isCloneable = !!slide.sourcePresentationId;
  const textPreview = slide.text
    ? slide.text.substring(0, 200) +
      (slide.text.length > 200 ? "..." : "")
    : "No text content";

  return (
    <Card className="border-slate-200 hover:border-slate-300 transition-colors">
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          {/* Mini thumbnail */}
          <div className="w-20 h-14 bg-gradient-to-br from-slate-100 to-slate-200 rounded flex items-center justify-center shrink-0">
            <Image className="w-5 h-5 text-slate-300" />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Header line */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[10px] ${typeClass}`}>
                {slide.slideType.replace(/_/g, " ")}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {deck.archetype.replace(/_/g, " ")}
              </Badge>
              {isCloneable ? (
                <Badge className="bg-emerald-500 text-white text-[10px] gap-1">
                  <CopyCheck className="w-3 h-3" />
                  Cloneable
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 text-amber-600 border-amber-300"
                >
                  <AlertTriangle className="w-3 h-3" />
                  No source
                </Badge>
              )}
              <span className="text-[10px] text-slate-400 ml-auto">
                {deck.fileName}
              </span>
            </div>

            {/* Text preview */}
            <p className="text-xs text-slate-600 line-clamp-1">{textPreview}</p>

            {/* DNA tags */}
            {dna?.detectedComponents && dna.detectedComponents.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {dna.detectedComponents.map((comp, i) => (
                  <span
                    key={i}
                    className={`text-[10px] px-1.5 py-0.5 rounded text-white ${COMPONENT_COLORS[comp.type] || "bg-slate-400"}`}
                  >
                    {comp.type.replace(/_/g, " ")}
                  </span>
                ))}
                {dna.layoutFingerprint && (
                  <span className="text-[10px] text-slate-400 ml-2">
                    {dna.layoutFingerprint.elementCount}el ·{" "}
                    {dna.layoutFingerprint.avgFontSize}pt
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
