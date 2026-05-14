import { useState, useEffect, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Library, RefreshCw, FileText, FolderOpen } from "lucide-react";

export default function SlideLibrary() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const accessToken = localStorage.getItem("brinc_google_access_token");

  const handleScan = async () => {
    if (!accessToken) {
      toast.error("Please connect your Google account first");
      return;
    }
    try {
      setScanning(true);
      toast.info("Scanning source decks and templates...");
      const res = await fetch("/api/google/library?accessToken=" + encodeURIComponent(accessToken));
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Scan failed");
      }
      setScanResult(data);
      toast.success(`Scanned ${data.scannedFiles || 0} file(s), found ${data.totalPptxFiles || 0} total`);
    } catch (err: any) {
      console.error("[Library Scan] Error:", err);
      toast.error("Scan failed: " + (err.message || String(err)));
    } finally {
      setScanning(false);
    }
  };

  // Auto-scan on load if connected
  useEffect(() => {
    if (accessToken && !scanResult) {
      handleScan();
    }
  }, [accessToken]);

  const patterns = scanResult?.patterns;
  const fileList = scanResult?.fileList || [];
  const logs = scanResult?.logs || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2"><ArrowLeft className="w-4 h-4" />Back</Button>
            <div><h1 className="text-lg font-bold text-[#1B2A4A]">BRINC</h1><p className="text-xs text-slate-500">Slide Library</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning || !accessToken} className="gap-2">
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {scanning ? "Scanning..." : "Rescan Library"}
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6">
        {!accessToken ? (
          <Card className="border-dashed border-slate-300"><CardContent className="py-16 text-center">
            <Library className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Connect Google to scan library</p>
            <p className="text-sm text-slate-400 mt-1">The library scans your 02 Source Decks and 03 Templates folders</p>
          </CardContent></Card>
        ) : scanning && !scanResult ? (
          <Card className="border-dashed border-slate-300"><CardContent className="py-16 text-center">
            <Loader2 className="w-12 h-12 text-slate-300 mx-auto mb-4 animate-spin" />
            <p className="text-slate-500 font-medium">Scanning source decks and templates...</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-6">
            {/* File List */}
            <Card className="border-slate-200">
              <CardContent className="py-4">
                <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 flex items-center gap-2"><FolderOpen className="w-4 h-4" />Discovered Files ({fileList.length})</h3>
                {fileList.length === 0 ? (
                  <p className="text-sm text-slate-400">No PPTX files found in 02 Source Decks or 03 Templates</p>
                ) : (
                  <div className="space-y-2">
                    {fileList.map((f: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <Badge variant="outline" className="text-xs">{f.folder}</Badge>
                        <span className="text-slate-700">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Patterns */}
            {patterns && (
              <>
                {/* Inferred Section Order */}
                <Card className="border-slate-200">
                  <CardContent className="py-4">
                    <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3 flex items-center gap-2"><Library className="w-4 h-4" />Inferred Section Order</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      {patterns.inferredSectionOrder?.map((sec: string, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <Badge className="bg-[#1B2A4A] text-white text-xs capitalize">{sec.replace(/_/g, " ")}</Badge>
                          {i < patterns.inferredSectionOrder.length - 1 && <span className="text-slate-400">→</span>}
                        </div>
                      )) || <p className="text-sm text-slate-400">No patterns learned yet</p>}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">This section order is derived from analyzing your source decks and templates</p>
                  </CardContent>
                </Card>

                {/* Content Samples */}
                {patterns.sectionContentSamples && Object.keys(patterns.sectionContentSamples).length > 0 && (
                  <Card className="border-slate-200">
                    <CardContent className="py-4">
                      <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3">Content Samples by Section</h3>
                      <div className="space-y-3">
                        {Object.entries(patterns.sectionContentSamples).map(([section, samples]: [string, any]) => (
                          <div key={section}>
                            <Badge variant="outline" className="text-xs capitalize mb-1">{section.replace(/_/g, " ")}</Badge>
                            <div className="space-y-1">
                              {(samples as string[]).slice(0, 3).map((sample, i) => (
                                <p key={i} className="text-xs text-slate-600 pl-2 border-l-2 border-slate-200">{sample}</p>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Layout Preferences */}
                {patterns.layoutPreferences && Object.keys(patterns.layoutPreferences).length > 0 && (
                  <Card className="border-slate-200">
                    <CardContent className="py-4">
                      <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3">Layout Preferences</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(patterns.layoutPreferences).map(([layout, count]: [string, any]) => (
                          <Badge key={layout} variant="outline" className="text-xs capitalize">{layout.replace(/_/g, " ")}: {count}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top Phrases */}
                {patterns.topPhrases && patterns.topPhrases.length > 0 && (
                  <Card className="border-slate-200">
                    <CardContent className="py-4">
                      <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3">Top Recurring Phrases</h3>
                      <div className="flex flex-wrap gap-2">
                        {patterns.topPhrases.slice(0, 10).map((p: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs bg-slate-50">{p.phrase} ({p.count})</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* File Summaries */}
                {patterns.fileSummaries && patterns.fileSummaries.length > 0 && (
                  <Card className="border-slate-200">
                    <CardContent className="py-4">
                      <h3 className="text-sm font-semibold text-[#1B2A4A] mb-3">Scanned File Details</h3>
                      <div className="space-y-2">
                        {patterns.fileSummaries.map((fs: any, i: number) => (
                          <div key={i} className="text-sm">
                            <div className="flex items-center gap-2">
                              <FileText className="w-3 h-3 text-slate-400" />
                              <span className="font-medium text-slate-700">{fs.fileName}</span>
                              <Badge variant="outline" className="text-xs">{fs.folder}</Badge>
                              <span className="text-slate-400">{fs.slideCount} slides</span>
                            </div>
                            <p className="text-xs text-slate-500 pl-5 mt-0.5">Flow: {fs.sectionFlow?.join(" → ") || "N/A"}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Logs */}
            {logs.length > 0 && (
              <Card className="border-slate-200 bg-slate-50">
                <CardContent className="py-4">
                  <h3 className="text-sm font-semibold text-slate-500 mb-2">Debug Logs</h3>
                  <pre className="text-xs text-slate-500 overflow-auto max-h-48">{logs.join("\n")}</pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
