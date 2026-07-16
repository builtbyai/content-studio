import React, { useEffect, useState } from "react";
import { Palette, Save, Plus, X, Loader2 } from "lucide-react";
import { api } from "../lib/api";

interface BrandProfile {
  id: string;
  name: string;
  voice: string;
  palette: string[];
  logoAssetIds: string[];
  forbiddenClaims: string[];
  productReferences: Array<{ id: string; label: string; mustPreserve: boolean; assetIds: string[] }>;
}

const DEFAULT_BRAND: BrandProfile = {
  id: "default",
  name: "Acme",
  voice: "Premium, confident, data-led roofing intelligence",
  palette: ["#C3A35B", "#272011", "#F7F7F5"],
  logoAssetIds: [],
  forbiddenClaims: ["miracle", "guaranteed", "instant"],
  productReferences: [],
};

export default function BrandEditor() {
  const [brand, setBrand] = useState<BrandProfile>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    api.getBrand().then(({ brand }) => {
      if (brand) setBrand({ ...DEFAULT_BRAND, ...brand });
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.putBrand(brand);
      setSavedAt(new Date().toLocaleTimeString());
    } finally { setSaving(false); }
  };

  const addPalette = () => setBrand({ ...brand, palette: [...brand.palette, "#000000"] });
  const updatePalette = (i: number, v: string) => setBrand({ ...brand, palette: brand.palette.map((c, idx) => idx === i ? v : c) });
  const removePalette = (i: number) => setBrand({ ...brand, palette: brand.palette.filter((_, idx) => idx !== i) });

  const addProduct = () => setBrand({ ...brand, productReferences: [...brand.productReferences, { id: crypto.randomUUID(), label: "", mustPreserve: true, assetIds: [] }] });
  const updateProduct = (i: number, patch: Partial<typeof brand.productReferences[0]>) =>
    setBrand({ ...brand, productReferences: brand.productReferences.map((p, idx) => idx === i ? { ...p, ...patch } : p) });
  const removeProduct = (i: number) => setBrand({ ...brand, productReferences: brand.productReferences.filter((_, idx) => idx !== i) });

  const updateForbidden = (raw: string) =>
    setBrand({ ...brand, forbiddenClaims: raw.split(",").map(s => s.trim()).filter(Boolean) });

  if (loading) return <div className="text-xs text-studio-soft-white/60 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> loading brand…</div>;

  return (
    <div className="studio-glass rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-sm flex items-center gap-2"><Palette className="w-4 h-4" /> Brand Profile</h3>
          <p className="text-[11px] text-studio-soft-white/50 mt-0.5">
            Drives every generator (Node 02 resolver + Copilot + Image Lab + Workflow Studio).
          </p>
        </div>
        <button
          onClick={save} disabled={saving}
          className="flex items-center gap-1 text-xs bg-studio-bronze text-studio-warm-black font-semibold px-3 py-1.5 rounded disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>
      </div>
      {savedAt && <div className="text-[10px] text-green-400">saved {savedAt}</div>}

      <div className="grid md:grid-cols-2 gap-3 text-xs">
        <label className="space-y-1">
          <div className="font-mono uppercase text-studio-soft-white/50">Name</div>
          <input value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
        </label>
        <label className="space-y-1">
          <div className="font-mono uppercase text-studio-soft-white/50">Forbidden claims (comma-sep)</div>
          <input value={brand.forbiddenClaims.join(", ")} onChange={(e) => updateForbidden(e.target.value)} className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
        </label>
      </div>

      <label className="space-y-1 block text-xs">
        <div className="font-mono uppercase text-studio-soft-white/50">Voice</div>
        <textarea rows={3} value={brand.voice} onChange={(e) => setBrand({ ...brand, voice: e.target.value })} className="w-full bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5" />
      </label>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <div className="font-mono uppercase text-studio-soft-white/50">Palette</div>
          <button onClick={addPalette} className="text-studio-bronze hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> add color</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {brand.palette.map((c, i) => (
            <div key={i} className="flex items-center gap-1 bg-studio-brown/40 border border-studio-bronze/15 rounded px-2 py-1">
              <input type="color" value={c} onChange={(e) => updatePalette(i, e.target.value)} className="w-5 h-5 cursor-pointer" />
              <input type="text" value={c} onChange={(e) => updatePalette(i, e.target.value)} className="w-20 bg-transparent text-xs font-mono" />
              <button onClick={() => removePalette(i)} className="text-studio-soft-white/40 hover:text-red-400"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <div className="font-mono uppercase text-studio-soft-white/50">Product references (preservation tokens)</div>
          <button onClick={addProduct} className="text-studio-bronze hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> add</button>
        </div>
        {brand.productReferences.length === 0 && <div className="text-[11px] text-studio-soft-white/40">No products. Add one if you have items that must appear exactly in generated images.</div>}
        <div className="space-y-2">
          {brand.productReferences.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              <input
                value={p.label} onChange={(e) => updateProduct(i, { label: e.target.value })}
                placeholder="Product label (e.g. Acme Slate Tile)"
                className="flex-1 bg-studio-brown/40 border border-studio-bronze/20 rounded px-2 py-1.5"
              />
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={p.mustPreserve} onChange={(e) => updateProduct(i, { mustPreserve: e.target.checked })} /> preserve
              </label>
              <button onClick={() => removeProduct(i)} className="text-studio-soft-white/40 hover:text-red-400"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
