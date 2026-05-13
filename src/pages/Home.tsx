import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Toaster, toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Checkbox } from "../components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import { Badge } from "../components/ui/badge";
import { trpc } from "../providers/trpc";
import {
  FileText, Briefcase, User, Mail, Linkedin, Building2,
  Sparkles, Plus, Loader2, ChevronRight, Archive, Library,
  LogIn, LogOut, CheckCircle,
} from "lucide-react";

const OFFERING_OPTIONS = [
  "Accelerator Program Design", "Incubator / Venture Building",
  "Startup Scouting & Selection", "Mentorship & Founder Coaching",
  "Pilot Execution & Commercialization", "Soft Landing / Market Entry",
  "Demo Day & Investor Access", "Strategic Consulting",
  "VentureVerse Platform", "UpRound Investment",
  "Corporate Innovation", "Government Partnership",
];

const CASE_STUDY_OPTIONS = [
  "Dubai DET / Hi2 Incubator", "EDB Manufacturing Accelerator",
  "MBRIF Innovation Fund", "QSTP Partnership",
  "Bahrain EDB", "Oman Accelerator",
];

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [proposalType, setProposalType] = useState<"quick" | "full">("quick");
  const [prospectName, setProspectName] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectLinkedin, setProspectLinkedin] = useState("");
  const [prospectCompany, setProspectCompany] = useState("");
  const [selectedOfferings, setSelectedOfferings] = useState<string[]>([]);
  const [selectedCaseStudies, setSelectedCaseStudies] = useState<string[]>([]);
  const [suggestedAngle, setSuggestedAngle] = useState("");
  const [includeOverview, setIncludeOverview] = useState(false);
  const [includeCaseStudies, setIncludeCaseStudies] = useState(false);
  const [otherNotes, setOtherNotes] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(() => {
    return localStorage.getItem("brinc_google_email");
  });
  const [connecting, setConnecting] = useState(false);

  // Handle Google OAuth callback
  useEffect(() => {
    const code = searchParams.get("google_code");
    const error = searchParams.get("google_error");

    if (error) {
      toast.error(`Google auth failed: ${error}`);
      // Clean up URL
      navigate("/", { replace: true });
      return;
    }

    if (!code) return;

    const verifier = sessionStorage.getItem("google_pkce_verifier");
    if (!verifier) {
      toast.error("OAuth session expired. Please try again.");
      navigate("/", { replace: true });
      return;
    }

    // Exchange code for tokens via tRPC
    setConnecting(true);
    toast.info("Completing Google connection...");

    trpc.google.handleCallback
      .mutate({ code, state: "", codeVerifier: verifier })
      .then((result) => {
        if (result.email) {
          localStorage.setItem("brinc_google_email", result.email);
          setGoogleEmail(result.email);
          toast.success(`Connected: ${result.email}`);
        }
      })
      .catch((err) => {
        toast.error(err.message || "Failed to connect Google account");
      })
      .finally(() => {
        setConnecting(false);
        sessionStorage.removeItem("google_pkce_verifier");
        navigate("/", { replace: true });
      });
  }, [searchParams, navigate]);

  const toggleOffering = (offering: string) => {
    setSelectedOfferings((prev) =>
      prev.includes(offering) ? prev.filter((o) => o !== offering) : [...prev, offering]
    );
  };

  const toggleCaseStudy = (cs: string) => {
    setSelectedCaseStudies((prev) =>
      prev.includes(cs) ? prev.filter((c) => c !== cs) : [...prev, cs]
    );
  };

  const handleSubmit = () => {
    if (!prospectName.trim()) { toast.error("Prospect name is required"); return; }
    if (selectedOfferings.length === 0) { toast.error("Select at least one offering"); return; }
    const mockId = Date.now();
    const proposal = {
      id: mockId, proposalType, prospectName, prospectEmail, prospectLinkedin, prospectCompany,
      selectedOfferings, suggestedAngle, includeOverview, includeCaseStudies, otherNotes,
      status: "ready", createdAt: new Date(),
    };
    const existing = JSON.parse(localStorage.getItem("brinc_proposals") || "[]");
    existing.unshift(proposal);
    localStorage.setItem("brinc_proposals", JSON.stringify(existing));
    toast.success("Demo proposal created!");
    navigate(`/proposal/${mockId}`);
  };

  const handleConnectGoogle = async () => {
    try {
      setConnecting(true);

      // Generate PKCE verifier
      const verifier = Array.from(crypto.getRandomValues(new Uint8Array(64)))
        .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66])
        .join("");
      sessionStorage.setItem("google_pkce_verifier", verifier);

      // Generate code challenge
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      const digest = await crypto.subtle.digest("SHA-256", data);
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // Get auth URL from backend (uses env vars for client_id and correct redirect_uri)
      const { authUrl } = await trpc.google.getAuthUrl.query();

      // Append PKCE parameters to the backend-constructed URL
      const url = new URL(authUrl);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");

      window.location.href = url.toString();
    } catch (err: any) {
      toast.error(err.message || "Failed to start Google auth");
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Toaster position="top-right" richColors />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1B2A4A] rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1B2A4A] tracking-tight">BRINC</h1>
              <p className="text-xs text-slate-500 -mt-0.5">Proposal Generator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {googleEmail ? (
              <Button variant="ghost" size="sm" className="gap-2 text-green-600"
                onClick={() => { localStorage.removeItem("brinc_google_email"); setGoogleEmail(null); toast.success("Disconnected"); }}>
                <CheckCircle className="w-4 h-4" /><LogOut className="w-3 h-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-[#1B2A4A]"
                onClick={handleConnectGoogle}
                disabled={connecting}
              >
                {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                Connect Google
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate("/library")} className="gap-2"><Library className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setShowLibrary(!showLibrary)} className="gap-2"><Archive className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      {showLibrary ? (
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-[#1B2A4A]">Proposal Library</h2>
              <p className="text-sm text-slate-500 mt-1">All generated proposals</p>
            </div>
            <Button onClick={() => setShowLibrary(false)} variant="outline">Back to Form</Button>
          </div>
          <ProposalList />
        </main>
      ) : (
        <main className="max-w-5xl mx-auto px-6 py-8">
          <Card className="mb-6 border-slate-200 shadow-sm">
            <CardHeader className="pb-3"><CardTitle className="text-base text-[#1B2A4A]">Proposal Type</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { type: "quick" as const, icon: FileText, title: "Quick Proposal", desc: "2-5 intro slides + optional overview & case studies" },
                  { type: "full" as const, icon: Briefcase, title: "Full Proposal", desc: "RFP-style with slide library for structured opportunities" },
                ].map((opt) => (
                  <button key={opt.type} onClick={() => setProposalType(opt.type)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${proposalType === opt.type ? "border-[#1B2A4A] bg-[#1B2A4A]/5" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <opt.icon className={`w-5 h-5 ${proposalType === opt.type ? "text-[#1B2A4A]" : "text-slate-400"}`} />
                      <span className={`font-semibold ${proposalType === opt.type ? "text-[#1B2A4A]" : "text-slate-600"}`}>{opt.title}</span>
                    </div>
                    <p className="text-sm text-slate-500">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base text-[#1B2A4A] flex items-center gap-2"><User className="w-4 h-4" />Prospect Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Contact Name <span className="text-red-500">*</span></Label>
                    <Input placeholder="Yasin Aboudaoud" value={prospectName} onChange={(e) => setProspectName(e.target.value)} className="mt-1.5" />
                  </div>
                  <div><Label>Company</Label><div className="relative mt-1.5"><Building2 className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><Input placeholder="Dubai Department of Economy" value={prospectCompany} onChange={(e) => setProspectCompany(e.target.value)} className="pl-9" /></div></div>
                  <div><Label>Email</Label><div className="relative mt-1.5"><Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><Input type="email" placeholder="yasin@det.gov.ae" value={prospectEmail} onChange={(e) => setProspectEmail(e.target.value)} className="pl-9" /></div></div>
                  <div><Label>LinkedIn</Label><div className="relative mt-1.5"><Linkedin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><Input placeholder="linkedin.com/in/..." value={prospectLinkedin} onChange={(e) => setProspectLinkedin(e.target.value)} className="pl-9" /></div></div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base text-[#1B2A4A] flex items-center gap-2"><Sparkles className="w-4 h-4" />Suggested Angle</CardTitle><CardDescription>Quick notes from the meeting</CardDescription></CardHeader>
                <CardContent>
                  <Textarea placeholder="They want to launch an AI-focused accelerator in Q3. Key concerns: founder quality, mentorship beyond capital, GCC market access. Emphasize our Asia pipeline and VentureVerse platform." value={suggestedAngle} onChange={(e) => setSuggestedAngle(e.target.value)} rows={5} className="resize-none" />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base text-[#1B2A4A]">Offerings to Include</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {OFFERING_OPTIONS.map((offering) => (
                      <Badge key={offering} variant={selectedOfferings.includes(offering) ? "default" : "outline"}
                        className={`cursor-pointer px-3 py-1.5 text-sm transition-all ${selectedOfferings.includes(offering) ? "bg-[#1B2A4A] hover:bg-[#243555]" : "bg-white hover:bg-slate-50 border-slate-300 text-slate-600"}`}
                        onClick={() => toggleOffering(offering)}>
                        {selectedOfferings.includes(offering) && <Plus className="w-3 h-3 mr-1 rotate-45" />}{offering}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base text-[#1B2A4A]">Optional Sections</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Checkbox id="overview" checked={includeOverview} onCheckedChange={(c) => setIncludeOverview(!!c)} />
                    <div><Label htmlFor="overview" className="font-medium">Include Brinc Overview</Label><p className="text-sm text-slate-500">3 slides: who we are, track record, network</p></div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-3">
                    <Checkbox id="casestudies" checked={includeCaseStudies} onCheckedChange={(c) => { setIncludeCaseStudies(!!c); if (!!c && selectedCaseStudies.length === 0) setSelectedCaseStudies(["Dubai DET / Hi2 Incubator"]); }} />
                    <div className="flex-1">
                      <Label htmlFor="casestudies" className="font-medium">Include Case Studies</Label>
                      {includeCaseStudies && <div className="flex flex-wrap gap-2 mt-2">{CASE_STUDY_OPTIONS.map((cs) => <Badge key={cs} variant={selectedCaseStudies.includes(cs) ? "default" : "outline"} className={`cursor-pointer text-xs ${selectedCaseStudies.includes(cs) ? "bg-[#1B2A4A]" : "bg-white text-slate-600 border-slate-300"}`} onClick={() => toggleCaseStudy(cs)}>{cs}</Badge>)}</div>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3"><CardTitle className="text-base text-[#1B2A4A]">Other Notes</CardTitle></CardHeader>
                <CardContent>
                  <Textarea placeholder="Budget $500K, Q3 start, GITEX pitch event integration..." value={otherNotes} onChange={(e) => setOtherNotes(e.target.value)} rows={4} className="resize-none" />
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button size="lg" onClick={handleSubmit} className="bg-[#1B2A4A] hover:bg-[#243555] text-white px-8 gap-2">Generate Proposal<ChevronRight className="w-4 h-4" /></Button>
          </div>
        </main>
      )}
    </div>
  );
}

function ProposalList() {
  const proposals = JSON.parse(localStorage.getItem("brinc_proposals") || "[]");
  const navigate = useNavigate();
  if (proposals.length === 0) return (
    <Card className="border-dashed border-slate-300"><CardContent className="py-12 text-center">
      <Archive className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <p className="text-slate-500">No proposals yet</p>
    </CardContent></Card>
  );
  return (
    <div className="grid gap-4">
      {proposals.map((p: any) => (
        <Card key={p.id} className="border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
          onClick={() => navigate(`/proposal/${p.id}`)}>
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.proposalType === "quick" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"}`}>
                {p.proposalType === "quick" ? <FileText className="w-5 h-5" /> : <Briefcase className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{p.prospectName}{p.prospectCompany && <span className="text-slate-500 font-normal"> — {p.prospectCompany}</span>}</h3>
                <Badge variant="outline" className="text-xs capitalize">{p.proposalType}</Badge>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
