import React, { useState } from "react";
import { Copy, Check, Palette, FileCode, CheckSquare, Sparkles } from "lucide-react";

export default function BrandPlayroom() {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const tokens = [
    { hex: "#C3A35B", name: "Golden Bronze", code: "var(--studio-bronze)", desc: "Primary CTAs, badges, links, active indicators, accents" },
    { hex: "#D4B975", name: "Bronze Light", code: "var(--studio-bronze-light)", desc: "Hover sheen, gradient glow, secondary tags" },
    { hex: "#A38645", name: "Bronze Dark", code: "var(--studio-bronze-dark)", desc: "Pressed/focus states, card borders" },
    { hex: "#51514F", name: "Charcoal", code: "var(--studio-charcoal)", desc: "Secondary text, metadata labels, rules" },
    { hex: "#35322A", name: "Charcoal Brown", code: "var(--studio-brown)", desc: "Default dark cards, secondary panel fillings" },
    { hex: "#272011", name: "Dark Coffee", code: "var(--studio-coffee)", desc: "Header containers, section backings, active hubs" },
    { hex: "#EBEBEA", name: "Alabaster", code: "var(--studio-alabaster)", desc: "High-contrast reading canvas, main blocks text" },
    { hex: "#120F0F", name: "Warm Black", code: "var(--studio-warm-black)", desc: "Background layout, primary contrast backing" },
    { hex: "#F7F7F5", name: "Soft White", code: "var(--studio-soft-white)", desc: "Primary font color, glowing titles" }
  ];

  const boilerplateCss = `:root {
  --studio-bronze: #C3A35B;
  --studio-bronze-light: #D4B975;
  --studio-bronze-dark: #A38645;
  --studio-charcoal: #51514F;
  --studio-brown: #35322A;
  --studio-coffee: #272011;
  --studio-alabaster: #EBEBEA;
  --studio-warm-black: #120F0F;
  --studio-soft-white: #F7F7F5;
}`;

  const boilerplateMdx = `<MarketingShell
  brand="Acme"
  logoSrc="/logo.svg"
  theme="bronze-charcoal"
  background="alabaster"
  nav={[
    { label: "Blog", href: "/blog" },
    { label: "Guides", href: "/guides" },
    { label: "Reviews", href: "/reviews" },
    { label: "Get Started", href: "/get-started" }
  ]}
/>`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(label);
    setTimeout(() => setCopiedToken(null), 1800);
  };

  return (
    <div className="space-y-8" id="playroom-section">
      
      {/* Visual tokens grid */}
      <div className="space-y-4 text-left">
        <h3 className="text-xs font-mono text-studio-bronze tracking-widest font-black uppercase flex items-center gap-2">
          <Palette className="w-4 h-4 text-studio-bronze" />
          Brand visual tokens
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="brand-system-tokens-grid">
          {tokens.map((tok) => (
            <div
              key={tok.hex}
              className="studio-glass p-4 rounded-xl flex items-center justify-between gap-4 group hover:border-studio-bronze/25 transition-colors"
              id={`token-card-${tok.hex.substring(1)}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg shrink-0 border border-studio-soft-white/10"
                  style={{ backgroundColor: tok.hex }}
                />
                <div className="font-sans">
                  <h4 className="text-xs font-semibold text-studio-soft-white">{tok.name}</h4>
                  <span className="text-[10px] font-mono text-studio-bronze-light font-bold block">{tok.hex}</span>
                  <p className="text-[10px] text-studio-soft-white/45 font-light leading-snug mt-0.5">{tok.desc}</p>
                </div>
              </div>

              <button
                onClick={() => handleCopy(tok.hex, tok.name)}
                className="p-1 px-1.5 hover:bg-studio-brown/30 border border-studio-bronze/10 text-studio-charcoal hover:text-studio-bronze rounded transition-all cursor-pointer"
                id={`copy-token-${tok.hex.substring(1)}`}
              >
                {copiedToken === tok.name ? <Check className="w-3.5 h-3.5 text-studio-bronze" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Code Boilerplate Copier Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left" id="boilerplates-setup-grid">
        {/* CSS Tokens Boilerplate */}
        <div className="studio-glass rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-studio-bronze/10">
            <span className="text-[10px] font-mono text-studio-bronze uppercase tracking-wider font-bold">
              Boilerplate CSS variables
            </span>
            <button
              onClick={() => handleCopy(boilerplateCss, "css_boiler")}
              className="p-1 text-studio-charcoal hover:text-studio-bronze transition-colors cursor-pointer"
              id="copy-css-boilerplate-btn"
            >
              {copiedToken === "css_boiler" ? <Check className="w-3.5 h-3.5 text-studio-bronze" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <pre className="p-3 bg-studio-warm-black/90 font-mono text-[9px] text-[#EBEBEA] rounded-lg border border-studio-bronze/5 select-all overflow-x-auto leading-relaxed">
            {boilerplateCss}
          </pre>
        </div>

        {/* MDX Shell Boilerplate */}
        <div className="studio-glass rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-studio-bronze/10">
            <span className="text-[10px] font-mono text-studio-bronze uppercase tracking-wider font-bold">
              Boilerplate MDX Components
            </span>
            <button
              onClick={() => handleCopy(boilerplateMdx, "mdx_boiler")}
              className="p-1 text-studio-charcoal hover:text-studio-bronze transition-colors cursor-pointer"
              id="copy-mdx-boilerplate-btn"
            >
              {copiedToken === "mdx_boiler" ? <Check className="w-3.5 h-3.5 text-studio-bronze" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <pre className="p-3 bg-studio-warm-black/90 font-mono text-[9px] text-[#EBEBEA] rounded-lg border border-studio-bronze/5 select-all overflow-x-auto leading-relaxed">
            {boilerplateMdx}
          </pre>
        </div>
      </div>

      {/* Brand system principles description block */}
      <div className="bg-studio-coffee/10 border-l border-studio-bronze/20 p-5 rounded-r-xl text-left font-sans space-y-2 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 studio-hud-accent pointer-events-none" />
        <h4 className="text-xs uppercase font-mono tracking-widest text-studio-bronze-light font-black flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-studio-bronze" />
          DESIGN HONESTY & RIGOR
        </h4>
        <p className="text-[11px] leading-relaxed text-[#EBEBEA] font-light">
          The suite respects absolute structural honesty. Standard visual modules remain functional-first: Alabaster provides readability under the detailed article text, Dark Coffee frames primary action headings, and Golden Bronze is reserved strictly for interactive feedback, buttons, and metrics.
        </p>
      </div>

    </div>
  );
}
