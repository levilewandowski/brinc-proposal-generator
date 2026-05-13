import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { toast, Toaster } from "sonner";
import {
  ArrowLeft, FileText, ExternalLink, Sparkles, User, Building2, Mail, Linkedin, Loader2, CheckCircle,
} from "lucide-react";

export default function ProposalView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const proposalId = Number(id);
  const proposals = JSON.parse(localStorage.getItem("brinc_proposals") || "[]");
  const proposal = proposals.find((p: any) => p.id === proposalId);

  const [creating, setCreating] = useState(false);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);

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
      toast.info("Creating Google Slides presentation...");

      const res = await fetch("/api/google/slides", {
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create slides");
      }

      setSlidesUrl(data.webViewLink);
      toast.success(`Slides created: ${data.slideCount} slides`);
    } catch (err: any) {
      console.error("[Create Slides] Error:", err);
      toast.error("Failed to create slides: " + (err.message || String(err)));
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
                    {creating ? "Creating Slides..." : accessToken ? "Create Google Slides" : "Connect Google to Create Slides"}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Slides Created</span>
                    </div>
                    <Button variant="outline" className="w-full gap-2" onClick={() => window.open(slidesUrl!, "_blank")}>
                      <ExternalLink className="w-4 h-4" /> Open in Google Slides
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 shadow-sm"><CardHeader className="pb-3 flex justify-between"><CardTitle className="text-sm">Generated Deck</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Slide num={1} title="Cover" content={`${proposal.prospectCompany || "Partner"} x Brinc`} type="cover" />
                  <Slide num={2} title="Strategic Context" content={`Why ${proposal.prospectCompany || "this partnership"} matters now...`} type="content" />
                  <Slide num={3} title="Proposed Collaboration" content={offerings.slice(0, 3).join(" \u00b7 ")} type="content" />
                  {proposal.includeOverview && <><Slide num={4} title="Brinc Overview" content="12+ years \u00b7 75+ programs \u00b7 170+ portfolio companies \u00b7 $1.69B+" type="content" /><Slide num={5} title="Our Approach" content="Tech-enabled, global approach with data-driven tools" type="content" /></>}
                  {proposal.includeCaseStudies && <Slide num={proposal.includeOverview ? 6 : 4} title="Relevant Experience" content="MENA case studies: DET Hi2, EDB Accelerator, MBRIF" type="content" />}
                  <Slide num={3 + (proposal.includeOverview ? 2 : 0) + (proposal.includeCaseStudies ? 1 : 0)} title="Next Steps" content="Contract \u2192 Mobilize \u2192 Timeline \u2192 Execute" type="final" />
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
