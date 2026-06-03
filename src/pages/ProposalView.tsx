import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { toast, Toaster } from "sonner";
import {
  ArrowLeft, FileText, ExternalLink, Sparkles, User, Building2, Mail, Linkedin, Loader2, CheckCircle, Library, Bug, CopyCheck, AlertTriangle, Layers,
} from "lucide-react";

export default function ProposalView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const proposalId = Number(id);
  const proposals = JSON.parse(localStorage.getItem("brinc_proposals") || "[]");
  const proposal = proposals.find((p: any) => p.id === proposalId);

  const [creating, setCreating] = useState(false);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);
  const [assemblyMap, setAssemblyMap] = useState<any[]>([]);
  const [debugReport, setDebugReport] = useState<any[] | null>(null);
  const [cloneErrors, setCloneErrors] = useState<any[] | null>(null);
  const [apiLogs, setApiLogs] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [batchDiagnostics, setBatchDiagnostics] = useState<Record<string, any> | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [selectedModules, setSelectedModules] = useState<string[]>(["why_brinc", "gcc_impact"]);

  // Phase 1 experimental toggle: ?pptx=1 routes to PPTX-first assembly endpoint
  const usePptxFirst = new URLSearchParams(window.location.search).get("pptx") === "1";

  var CANONICAL_MODULES = [
    { key: "why_brinc",              label: "Why Brinc",             desc: "Brinc introduction" },
    { key: "global_network",         label: "Global Network",        desc: "Global footprint" },
    { key: "diversified_portfolio",  label: "Diversified Portfolio", desc: "Portfolio overview" },
    { key: "accelerator_programs",   label: "Accelerator Programs",  desc: "Program structure" },
    { key: "gcc_impact",             label: "GCC Impact",            desc: "Impact metrics" },
    { key: "upround",                label: "Upround",               desc: "Portfolio companies" },
    { key: "ventureverse",           label: "VentureVerse",          desc: "Deal flow platform" },
  ];

  if (!proposal) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-500">Proposal not found</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Back</Button>
    </div>
  );

  const offerings = proposal.selectedOfferings || [];
  const googleEmail = localStorage.getItem("brinc_google_email");
  const accessToken = localStorage.getItem("brinc_google_access_token");

  const handleCreateSlides = async () => {
    if (!accessToken) {
      toast.error("Please connect your Google account first");
      return;
    }
    const refreshToken = localStorage.getItem("brinc_google_refresh_token") || "";
    try {
      setCreating(true);
      toast.info("Scanning library for patterns...");

      // Step 1: Scan library for patterns
      let patterns = null;
      try {
        const libRes = await fetch("/api/google/library?accessToken=" + encodeURIComponent(accessToken));
        const libData = await libRes.json();
        if (libData.ok && libData.patterns) {
          patterns = libData.patterns;
          toast.success(`Library scan: ${libData.scannedFiles || 0} file(s) analyzed`);
          console.log("[Library] Patterns:", patterns);
        }
      } catch (libErr) {
        console.warn("[Library] Scan failed, using defaults:", libErr);
      }

      toast.info(usePptxFirst ? "Assembling PPTX (experimental)..." : "Creating Google Slides presentation...");

      // Step 2: Create slides with archetype + patterns
      const apiEndpoint = usePptxFirst ? "/api/google/pptx-assemble" : "/api/google/slides";
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          refreshToken,
          prospectName: proposal.prospectName,
          prospectCompany: proposal.prospectCompany,
          offerings,
          suggestedAngle: proposal.suggestedAngle,
          includeOverview: proposal.includeOverview,
          includeCaseStudies: proposal.includeCaseStudies,
          archetype: proposal.archetype || "accelerator",
          geography: proposal.geography || "UAE",
          patterns,
          debug: debugMode,
          modules: selectedModules,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch { /* leave as {} */ }
      if (!res.ok) {
        setApiError("HTTP " + res.status + ": " + (data.error || text || "Unknown error"));
        setApiLogs(data.logs || []);
        setSlidesUrl(data.webViewLink || null);
        setAssemblyMap(data.sectionMap || []);
        setDebugReport(data.debugReport || null);
        throw new Error(data.error || "HTTP " + res.status);
      }

      setSlidesUrl(data.webViewLink);
      setAssemblyMap(data.sectionMap || []);
      setDebugReport(data.debugReport || null);
      setCloneErrors(data.cloneErrors || null);
      setApiLogs(data.logs || []);
      setApiError(data.error || null);
      // Extract structured batch diagnostics from logs
      const diags: Record<string, any> = {};
      (data.logs || []).forEach((line: string) => {
        if (line.startsWith("REQ_TYPES:")) try { diags.REQ_TYPES = JSON.parse(line.replace("REQ_TYPES: ", "")); } catch {}
        if (line.startsWith("REQ_COUNT:")) diags.REQ_COUNT = line.replace("REQ_COUNT: ", "");
        if (line.startsWith("REQ_PREVIEW:")) try { diags.REQ_PREVIEW = JSON.parse(line.replace("REQ_PREVIEW: ", "")); } catch {}
        if (line.startsWith("BATCH_HTTP:")) diags.BATCH_HTTP = line.replace("BATCH_HTTP: ", "");
        if (line.startsWith("BATCH_REPLY_COUNT:")) diags.BATCH_REPLY_COUNT = line.replace("BATCH_REPLY_COUNT: ", "");
        if (line.startsWith("BATCH_REPLY_ERRORS:")) try { diags.BATCH_REPLY_ERRORS = JSON.parse(line.replace("BATCH_REPLY_ERRORS: ", "")); } catch {}
        if (line.startsWith("PAGES_AFTER_BATCH:")) diags.PAGES_AFTER_BATCH = line.replace("PAGES_AFTER_BATCH: ", "");
        if (line.startsWith("BATCH_SEND:")) diags.BATCH_SEND = line.replace("BATCH_SEND: ", "");
        if (line.startsWith("BATCH_FAILED_HTTP:")) diags.BATCH_FAILED_HTTP = line.replace("BATCH_FAILED_HTTP: ", "");
      });
      setBatchDiagnostics(Object.keys(diags).length > 0 ? diags : null);
      const retrieved = (data.sectionMap || []).filter((s: any) => s.source === "retrieved").length;
      const inspired = (data.sectionMap || []).filter((s: any) => s.source === "inspired").length;
      const generated = (data.sectionMap || []).filter((s: any) => s.source === "generated").length;
      const cloned = (data.sectionMap || []).filter((s: any) => s.source === "cloned").length;
      const cloneErrCount = (data.cloneErrors || []).length;
      toast.success(`Slides: ${data.slideCount} (${cloned} cloned, ${retrieved} retrieved, ${inspired} inspired, ${generated} generated)${cloneErrCount > 0 ? ` · ${cloneErrCount} clone errors` : ""}`);
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.error("[Create Slides] Error after " + elapsed + "ms:", err);
      toast.error("Failed after " + elapsed + "ms: " + (err.message || String(err)));
      // Ensure apiError is set even for network/JSON parse failures
      setApiError((prev) => prev || (err.message || String(err)));
      setApiLogs((prev) => prev.length > 0 ? prev : ["FRONTEND_CATCH: " + (err.message || String(err)) + " | elapsed=" + elapsed + "ms | httpStatus=" + httpStatus + " | response=" + responseText.substring(0, 500)]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Toaster position="top-right" richColors />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2"><ArrowLeft className="w-4 h-4" />Back</Button>
            <Separator orientation="vertical" className="h-6" />
            <div><h1 className="text-lg font-bold text-[#1B2A4A]">BRINC</h1><p className="text-xs text-slate-500">Proposal Preview</p></div>
          </div>
          <Badge variant="outline" className={`capitalize ${proposal.proposalType === "quick" ? "text-blue-600 border-blue-200 bg-blue-50" : "text-amber-600 border-amber-200 bg-amber-50"}`}>{proposal.proposalType} Proposal</Badge>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm text-[#1B2A4A]">Prospect</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2"><User className="w-4 h-4 text-slate-400 mt-0.5" /><p className="font-medium text-sm">{proposal.prospectName}</p></div>
                {proposal.prospectCompany && <div className="flex items-start gap-2"><Building2 className="w-4 h-4 text-slate-400 mt-0.5" /><p className="text-sm text-slate-600">{proposal.prospectCompany}</p></div>}
                {proposal.prospectEmail && <div className="flex items-start gap-2"><Mail className="w-4 h-4 text-slate-400 mt-0.5" /><p className="text-sm text-slate-600">{proposal.prospectEmail}</p></div>}
                {proposal.prospectLinkedin && <div className="flex items-start gap-2"><Linkedin className="w-4 h-4 text-slate-400 mt-0.5" /><a href={proposal.prospectLinkedin} target="_blank" className="text-sm text-blue-600 hover:underline">LinkedIn</a></div>}
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm text-[#1B2A4A]">Selected Offerings</CardTitle></CardHeader>
              <CardContent><div className="flex flex-wrap gap-2">{offerings.map((o: string) => <Badge key={o} variant="outline" className="bg-[#1B2A4A]/5 text-[#1B2A4A] border-[#1B2A4A]/20">{o}</Badge>)}</div></CardContent>
            </Card>
            {proposal.suggestedAngle && <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm text-[#1B2A4A]">Suggested Angle</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-600 whitespace-pre-wrap">{proposal.suggestedAngle}</p></CardContent></Card>}
            {proposal.otherNotes && <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-sm text-[#1B2A4A]">Other Notes</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-600 whitespace-pre-wrap">{proposal.otherNotes}</p></CardContent></Card>}

            {/* Debug Toggle */}
            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <Bug className="w-3 h-3" />
                Debug mode (shows retrieval diagnostics)
              </label>
            </div>

            {/* Canonical Module Selector */}
            <Card className="border-slate-200">
              <CardContent className="py-3">
                <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Canonical Slide Modules
                  <span className="text-[10px] font-normal text-slate-400">(cloned 1:1 from approved decks)</span>
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CANONICAL_MODULES.map((mod) => (
                    <label
                      key={mod.key}
                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                        selectedModules.includes(mod.key)
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedModules.includes(mod.key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModules([...selectedModules, mod.key]);
                          } else {
                            setSelectedModules(selectedModules.filter((m) => m !== mod.key));
                          }
                        }}
                        className="rounded border-slate-300"
                      />
                      <div>
                        <span className="font-medium">{mod.label}</span>
                        <span className="block text-[10px] text-slate-400">{mod.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Create Slides Button */}
            <Card className="border-[#1B2A4A]/20 bg-[#1B2A4A]/5">
              <CardContent className="py-4">
                {!slidesUrl ? (
                  <Button
                    className="w-full bg-[#1B2A4A] hover:bg-[#243555] gap-2"
                    onClick={handleCreateSlides}
                    disabled={creating || !accessToken}
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    {creating ? "Creating Slides..." : accessToken ? `Create Google Slides${debugMode ? " (Debug)" : ""}` : "Connect Google to Create Slides"}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className={`flex items-center gap-2 ${apiError ? "text-amber-600" : "text-green-600"}`}>
                      {apiError ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      <span className="text-sm font-medium">{apiError ? "Slides Partial (see diagnostics)" : "Slides Created"}</span>
                    </div>
                    {apiError && (
                      <div className="text-[10px] text-amber-700 bg-amber-100 rounded p-2 border border-amber-200">
                        batchUpdate issue detected. Check "BatchUpdate Diagnostics" panel below.
                      </div>
                    )}
                    <Button variant="outline" className="w-full gap-2" onClick={() => window.open(slidesUrl!, "_blank")}>
                      <ExternalLink className="w-4 h-4" /> Open in Google Slides
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2 space-y-6">
            {/* Assembly Map */}
            {assemblyMap.length > 0 && (
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm text-[#1B2A4A]">Assembly Breakdown</CardTitle>
                    <div className="flex gap-2 text-xs flex-wrap">
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        {assemblyMap.filter(s => s.source === "cloned").length} Cloned
                      </Badge>
                      <Badge className="bg-green-50 text-green-700 border-green-200">
                        {assemblyMap.filter(s => s.source === "retrieved").length} Retrieved
                      </Badge>
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                        {assemblyMap.filter(s => s.source === "inspired").length} Inspired
                      </Badge>
                      <Badge className="bg-slate-50 text-slate-600 border-slate-200">
                        {assemblyMap.filter(s => s.source === "generated").length} Generated
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {assemblyMap.map((sec: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-1.5 px-2 rounded hover:bg-slate-50">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          sec.source === "clone" || sec.source === "cloned" ? "bg-purple-600 text-white" :
                          sec.source === "canonical" ? "bg-[#1B2A4A] text-white" :
                          sec.source === "retrieved" ? "bg-green-500 text-white" :
                          sec.source === "inspired" ? "bg-amber-500 text-white" :
                          "bg-slate-300 text-slate-600"
                        }`}>{i + 1}</span>
                        <span className="flex-1 font-medium text-slate-700">{sec.label || sec.type}</span>
                        <span className="text-[10px] text-slate-400">{sec.class || ""}</span>
                        <Badge variant="outline" className={`text-[10px] capitalize ${
                          sec.source === "clone" || sec.source === "cloned" ? "border-purple-200 text-purple-700 bg-purple-50" :
                          sec.source === "canonical" ? "border-[#1B2A4A]/30 text-[#1B2A4A] bg-[#1B2A4A]/5" :
                          sec.source === "retrieved" ? "border-green-200 text-green-600 bg-green-50" :
                          sec.source === "inspired" ? "border-amber-200 text-amber-600 bg-amber-50" :
                          "border-slate-200 text-slate-500 bg-slate-50"
                        }`}>
                          {sec.source === "clone" || sec.source === "cloned" ? "CLONE" : sec.source === "canonical" ? "CANON" : sec.source === "retrieved" ? "R" : sec.source === "inspired" ? "I" : "G"}
                          {sec.score > 0 ? ` ${sec.score}` : ""}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Clone Errors */}
            {cloneErrors && cloneErrors.length > 0 && (
              <Card className="border-red-200 bg-red-50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Clone Errors ({cloneErrors.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {cloneErrors.map((err: any, i: number) => (
                      <div key={i} className="text-xs text-red-600 font-mono bg-red-100 rounded p-2">
                        <div>Slide: {err.slideId}</div>
                        <div>Source: {err.sourceId}</div>
                        <div>Error: {err.error}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Batch Execution Diagnostics — show in debug mode after any attempt */}
            {debugMode && (slidesUrl || apiError) && (
              <Card className="border-amber-300 bg-amber-50/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    BatchUpdate Diagnostics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Parsed diagnostics */}
                  {batchDiagnostics && Object.keys(batchDiagnostics).length > 0 ? (
                    <div className="space-y-2 text-xs font-mono mb-3">
                      {batchDiagnostics.REQ_COUNT !== undefined && (
                        <div className="flex justify-between"><span className="text-slate-500">REQ_COUNT:</span><span className="font-bold text-amber-700">{batchDiagnostics.REQ_COUNT}</span></div>
                      )}
                      {batchDiagnostics.REQ_TYPES !== undefined && (
                        <div className="flex justify-between"><span className="text-slate-500">REQ_TYPES:</span><span className="text-amber-700">{JSON.stringify(batchDiagnostics.REQ_TYPES)}</span></div>
                      )}
                      {batchDiagnostics.BATCH_HTTP !== undefined && (
                        <div className="flex justify-between"><span className="text-slate-500">BATCH_HTTP:</span><span className={String(batchDiagnostics.BATCH_HTTP).includes("ok=true") ? "text-green-600 font-bold" : "text-red-600 font-bold"}>{batchDiagnostics.BATCH_HTTP}</span></div>
                      )}
                      {batchDiagnostics.BATCH_SEND !== undefined && (
                        <div className="flex justify-between"><span className="text-slate-500">BATCH_SEND:</span><span className="text-amber-700">{batchDiagnostics.BATCH_SEND}</span></div>
                      )}
                      {batchDiagnostics.BATCH_REPLY_COUNT !== undefined && (
                        <div className="flex justify-between"><span className="text-slate-500">BATCH_REPLY_COUNT:</span><span className="text-amber-700">{batchDiagnostics.BATCH_REPLY_COUNT}</span></div>
                      )}
                      {batchDiagnostics.BATCH_REPLY_ERRORS !== undefined && (
                        <div>
                          <span className="text-red-500 font-bold">BATCH_REPLY_ERRORS:</span>
                          <pre className="text-red-600 bg-red-50 rounded p-2 mt-1 overflow-auto max-h-40">{JSON.stringify(batchDiagnostics.BATCH_REPLY_ERRORS, null, 2)}</pre>
                        </div>
                      )}
                      {batchDiagnostics.PAGES_AFTER_BATCH !== undefined && (
                        <div className="flex justify-between"><span className="text-slate-500">PAGES_AFTER_BATCH:</span><span className="text-amber-700">{batchDiagnostics.PAGES_AFTER_BATCH}</span></div>
                      )}
                      {batchDiagnostics.BATCH_FAILED_HTTP !== undefined && (
                        <div className="bg-red-100 rounded p-2"><span className="text-red-600 font-bold">BATCH_FAILED_HTTP:</span><span className="text-red-700">{batchDiagnostics.BATCH_FAILED_HTTP}</span></div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 mb-3 italic">No structured diagnostics found in logs (check raw logs below).</div>
                  )}
                  {/* data.error */}
                  {apiError ? (
                    <div className="mb-3 bg-red-100 border border-red-300 rounded p-2 text-xs text-red-700 font-bold font-mono">
                      data.error: {apiError}
                    </div>
                  ) : (
                    <div className="mb-3 text-xs text-green-600 font-mono">data.error: null</div>
                  )}
                  {/* Raw logs */}
                  <details className="mt-2" open>
                    <summary className="cursor-pointer text-xs text-slate-600 font-medium">
                      Raw data.logs ({apiLogs.length} lines)
                    </summary>
                    {apiLogs.length > 0 ? (
                      <pre className="mt-2 text-[10px] bg-slate-900 text-slate-200 rounded p-3 overflow-auto max-h-96">{apiLogs.join("\n")}</pre>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400 italic">No logs returned by API.</p>
                    )}
                  </details>
                </CardContent>
              </Card>
            )}

            {/* Debug Report */}
            {debugReport && debugReport.length > 0 && (
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-[#1B2A4A] flex items-center gap-2">
                    <Bug className="w-4 h-4" />
                    Retrieval Debug Report ({debugReport.length} entries)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-auto">
                    {debugReport.map((entry: any, i: number) => (
                      <div key={i} className="text-xs border border-slate-200 rounded p-2.5 bg-slate-50">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-bold text-slate-700">#{entry.slideNumber}</span>
                          <Badge className={`text-[10px] ${
                            entry.mode === "CLONE" ? "bg-emerald-600 text-white" :
                            entry.mode === "RETRIEVE" ? "bg-green-500 text-white" :
                            entry.mode === "INSPIRE" ? "bg-amber-500 text-white" :
                            entry.mode === "CANONICAL" ? "bg-purple-500 text-white" :
                            "bg-slate-400 text-white"
                          }`}>
                            {entry.mode || "GENERATE"}
                          </Badge>
                          <span className="text-slate-500">{entry.targetLabel || entry.type}</span>
                          {entry.cloneAttempted && (
                            <span className={`ml-auto ${entry.cloneSuccess ? "text-emerald-600" : "text-red-500"}`}>
                              {entry.cloneSuccess ? "✓ Cloned" : "✗ Clone Failed"}
                            </span>
                          )}
                        </div>

                        {/* Candidates */}
                        {entry.topCandidates && entry.topCandidates.length > 0 && (
                          <div className="space-y-1 mb-1.5">
                            <p className="text-slate-500 font-medium">Top Candidates:</p>
                            {entry.topCandidates.map((c: any, j: number) => (
                              <div key={j} className="flex items-center gap-2 pl-2 border-l-2 border-slate-300">
                                <span className={`font-bold ${j === 0 ? "text-emerald-600" : "text-slate-500"}`}>
                                  {c.score}
                                </span>
                                <span className="text-slate-600 truncate flex-1">{c.sourceDeck || "?"}</span>
                                <span className="text-slate-400">
                                  {c.sourcePresentationId ? "✓ ID" : "✗ No ID"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Fallback reason */}
                        {entry.fallbackReason && (
                          <p className="text-amber-600">{entry.fallbackReason}</p>
                        )}

                        {/* Clone error */}
                        {entry.cloneError && (
                          <p className="text-red-500">Clone error: {entry.cloneError}</p>
                        )}

                        {/* Mode reason */}
                        {entry.reason && (
                          <p className="text-slate-400">{entry.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3 flex justify-between"><CardTitle className="text-sm">Deck Preview</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Slide num={1} title="Cover" content={`${proposal.prospectCompany || "Partner"} x Brinc`} type="cover" />
                  <Slide num={2} title="Title Sentence" content={`${proposal.prospectCompany || "Partner"} x Brinc — Partnership Proposal`} type="content" />
                  <Slide num={3} title="Executive Summary" content="Program overview, objectives, and approach at a glance" type="content" />
                  <Slide num={4} title="The Opportunity" content={`Why ${proposal.prospectCompany || "this"} should act now`} type="content" />
                  <Slide num={5} title="Proposed Collaboration" content={offerings.slice(0, 3).join(" \u00b7 ")} type="content" />
                  <Slide num={6} title="Next Steps" content="Contract \u2192 Mobilize \u2192 Timeline \u2192 Execute" type="final" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function Slide({ num, title, content, type }: { num: number; title: string; content: string; type: "cover" | "content" | "final" }) {
  const bg = type === "cover" ? "bg-gradient-to-br from-[#1B2A4A] to-[#2a3f6b] text-white" : type === "final" ? "bg-gradient-to-br from-slate-100 to-slate-200" : "bg-white border border-slate-200";
  return (
    <div className={`rounded-lg p-4 ${bg}`}>
      <div className="flex items-center gap-3">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${type === "cover" ? "bg-white/20 text-white" : "bg-[#1B2A4A] text-white"}`}>{num}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wider ${type === "cover" ? "text-white/70" : "text-slate-400"}`}>{title}</p>
          <p className={`text-sm mt-0.5 ${type === "cover" ? "text-white font-medium" : "text-slate-700"}`}>{content}</p>
        </div>
      </div>
    </div>
  );
}
