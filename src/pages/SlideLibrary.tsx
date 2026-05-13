import { useState, useRef, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Upload, Search, Loader2, Image, Trash2, Grid3X3, List } from "lucide-react";

const OFFERING_TAGS = ["Accelerator", "Incubator", "Mentorship", "Pilot", "Soft Landing", "Demo Day", "Consulting", "VentureVerse", "UpRound", "Corporate Innovation", "Government"];
const SECTOR_TAGS = ["Government", "AI", "ClimateTech", "Web3", "HealthTech", "Space", "Manufacturing", "Fintech", "EdTech", "FoodTech"];

export default function SlideLibrary() {
  const navigate = useNavigate();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [offeringFilter, setOfferingFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".pptx")) { toast.error("Only .pptx files"); return; }
    setUploading(true);
    toast.info("In demo mode: upload would extract slides here");
    setTimeout(() => { setUploading(false); }, 1000);
  };

  const slides: any[] = []; // Populated from DB in full version

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2"><ArrowLeft className="w-4 h-4" />Back</Button>
            <div><h1 className="text-lg font-bold text-[#1B2A4A]">BRINC</h1><p className="text-xs text-slate-500">Slide Library</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setView(view === "grid" ? "list" : "grid")}>{view === "grid" ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}</Button>
            <input type="file" ref={fileInputRef} accept=".pptx" className="hidden" onChange={handleFileUpload} />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-[#1B2A4A] hover:bg-[#243555] gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Upload Deck
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><Input placeholder="Search slides..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
          <select value={offeringFilter} onChange={(e) => setOfferingFilter(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-white"><option value="">All Offerings</option>{OFFERING_TAGS.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="px-3 py-2 border rounded-md text-sm bg-white"><option value="">All Sectors</option>{SECTOR_TAGS.map(t => <option key={t} value={t}>{t}</option>)}</select>
        </div>
        <Card className="border-dashed border-slate-300"><CardContent className="py-16 text-center">
          <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Slide Library Ready</p>
          <p className="text-sm text-slate-400 mt-1">Upload a .pptx deck to extract slides</p>
        </CardContent></Card>
      </main>
    </div>
  );
}