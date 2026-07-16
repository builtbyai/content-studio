import React, { useState } from "react";
import { CalendarSlot, SocialPlatform, CreativeAngle } from "../types";
import { Calendar, Clock, Trash, Copy, Check, CheckSquare, Edit3, Save, Compass, FileText, Download } from "lucide-react";
import { articles } from "../data/articles";

interface CampaignPlannerProps {
  plannerSlots: CalendarSlot[];
  onUpdateSlot: (updated: CalendarSlot) => void;
  onClearSlot: (id: string) => void;
}

export default function CampaignPlanner({
  plannerSlots,
  onUpdateSlot,
  onClearSlot
}: CampaignPlannerProps) {
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [editingNotes, setEditingNotes] = useState("");
  const [editingText, setEditingText] = useState("");
  const [editingStatus, setEditingStatus] = useState<"draft" | "scheduled" | "published">("draft");
  const [copiedSlotId, setCopiedSlotId] = useState<string | null>(null);

  const days: CalendarSlot["dayOfWeek"][] = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  ];

  const handleEditSlot = (slot: CalendarSlot) => {
    setSelectedSlot(slot);
    setEditingNotes(slot.notes || "");
    setEditingText(slot.postText);
    setEditingStatus(slot.status);
  };

  const handleSaveSlot = () => {
    if (!selectedSlot) return;
    onUpdateSlot({
      ...selectedSlot,
      postText: editingText,
      notes: editingNotes,
      status: editingStatus
    });
    setSelectedSlot(null);
  };

  const handleCopySlot = (slot: CalendarSlot) => {
    navigator.clipboard.writeText(slot.postText);
    setCopiedSlotId(slot.id);
    setTimeout(() => setCopiedSlotId(null), 1800);
  };

  const handleDownloadAll = () => {
    const scheduled = plannerSlots.filter(s => s.postText.trim());
    if (scheduled.length === 0) {
      alert("No campaigns currently active on the calendar planner grid to export.");
      return;
    }

    const exportedContent = scheduled.map(s => {
      const art = articles.find(a => a.id === s.articleId);
      return `========================================
DAY: ${s.dayOfWeek.toUpperCase()} | TIME: ${s.timeOfDay}
PLATFORM: ${s.platform.toUpperCase()} | ANGLE: ${s.angle.toUpperCase()}
STATUS: ${s.status.toUpperCase()}
PLAYBOOK: ${art ? art.title : "Direct Brand Campaign"}
========================================

${s.postText}

Notes: ${s.notes || "None"}
`;
    }).join("\n\n");

    const blob = new Blob([exportedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `acme-campaign-calendar-${new Date().toISOString().substring(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" id="planner-section">
      
      {/* Calendar header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 studio-glass rounded-xl" id="planner-header-bar">
        <div className="text-left font-sans">
          <h3 className="text-sm font-semibold text-studio-soft-white font-display">
            Acme Social Campaign Calendar
          </h3>
          <p className="text-[10px] text-studio-bronze-light font-light italic mt-0.5">
            Synchronize direct storm-campaigns across daily calendar channels
          </p>
        </div>

        <button
          onClick={handleDownloadAll}
          className="bg-studio-bronze hover:bg-studio-bronze-light text-studio-warm-black text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ml-auto"
          id="export-calendar-btn"
        >
          <Download className="w-3.5 h-3.5" />
          Export Campaign Suite
        </button>
      </div>

      {/* Grid of weekdays */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4" id="calendar-grid-slots">
        {days.map((day) => {
          const slotsForDay = plannerSlots.filter((slot) => slot.dayOfWeek === day);

          return (
            <div key={day} className="flex flex-col bg-studio-brown/10 border border-studio-bronze/5 rounded-xl p-4 space-y-3" id={`planner-day-${day.toLowerCase()}`}>
              <h4 className="text-xs font-display font-semibold text-studio-bronze tracking-wide border-b border-studio-bronze/10 pb-1.5 text-left">
                {day}
              </h4>

              <div className="space-y-3 flex-1 flex flex-col justify-start">
                {slotsForDay.map((slot) => {
                  const hasContent = !!slot.postText.trim();
                  const targetArt = articles.find(a => a.id === slot.articleId);

                  return (
                    <div
                      key={slot.id}
                      className={`rounded-lg p-3 text-left border relative group transition-all flex flex-col justify-between min-h-[140px] ${
                        hasContent
                          ? "bg-[#35322A]/40 border-studio-bronze/25"
                          : "bg-studio-warm-black/20 border-dashed border-studio-charcoal/20 hover:border-studio-bronze/20"
                      }`}
                      id={`slot-card-${slot.id}`}
                    >
                      {/* Slot Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-[9px] font-mono text-studio-soft-white/50">
                          <Clock className="w-3 h-3 text-studio-bronze" />
                          <span>{slot.timeOfDay}</span>
                        </div>

                        {hasContent && (
                          <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono font-bold ${
                            slot.status === "published"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : slot.status === "scheduled"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                          }`}>
                            {slot.status}
                          </span>
                        )}
                      </div>

                      {/* Slot Content */}
                      {hasContent ? (
                        <div className="space-y-2 flex-1 flex flex-col justify-between">
                          <div>
                            <span className="text-[8px] uppercase font-mono tracking-widest text-studio-bronze-light block">
                              {slot.platform === "short_video" ? "Short Video" : slot.platform.toUpperCase()}
                            </span>
                            <p className="text-[10px] text-[#EBEBEA] font-sans leading-relaxed line-clamp-3 font-light mt-1 whitespace-pre-line">
                              {slot.postText}
                            </p>
                            {targetArt && (
                              <span className="text-[8px] text-studio-charcoal font-sans block mt-1 line-clamp-1 italic font-semibold">
                                Play: {targetArt.title}
                              </span>
                            )}
                          </div>

                          {/* Hover interactions */}
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-studio-bronze/5 select-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditSlot(slot)}
                              className="text-[10px] text-studio-bronze-light hover:underline font-mono font-medium cursor-pointer"
                              id={`edit-slot-${slot.id}`}
                            >
                              Edit
                            </button>
                            <span className="text-studio-charcoal text-[10px] select-none">•</span>
                            <button
                              onClick={() => handleCopySlot(slot)}
                              className="text-[10px] text-studio-soft-white/60 hover:underline font-mono font-medium cursor-pointer flex items-center gap-1"
                              id={`copy-slot-btn-${slot.id}`}
                            >
                              {copiedSlotId === slot.id ? "Done" : "Copy"}
                            </button>
                            <span className="text-studio-charcoal text-[10px] select-none">•</span>
                            <button
                              onClick={() => onClearSlot(slot.id)}
                              className="text-[10px] text-red-400 hover:underline font-mono font-medium cursor-pointer"
                              id={`clear-slot-${slot.id}`}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center my-auto py-4 select-none">
                          <span className="text-[9px] font-mono text-studio-soft-white/30 block mb-1">
                            {slot.timeOfDay}
                          </span>
                          <button
                            onClick={() => handleEditSlot(slot)}
                            className="bg-studio-brown/30 hover:bg-studio-brown/60 text-studio-bronze-light text-[9px] font-sans font-bold px-2 py-1 rounded border border-studio-bronze/10 cursor-pointer"
                            id={`add-campaign-${slot.id}`}
                          >
                            + Draft
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Editor Modal Popup Overlay */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-studio-warm-black/8 w-full p-4" id="planner-modal-backdrop">
          <div className="w-full max-w-lg bg-studio-brown/95 border border-studio-bronze/25 rounded-2xl p-6 shadow-2xl space-y-4 text-left studio-glass-glow" id="planner-edit-modal">
            
            <div className="flex items-center justify-between pb-3 border-b border-studio-bronze/10">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-studio-bronze" />
                <h3 className="text-sm font-display font-semibold text-studio-soft-white">
                  Schedule Campaign • {selectedSlot.dayOfWeek} {selectedSlot.timeOfDay}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSlot(null)}
                className="text-xs text-studio-soft-white/60 hover:text-studio-soft-white font-mono cursor-pointer"
                id="close-planner-modal-btn"
              >
                Cancel
              </button>
            </div>

            {/* Campaign details */}
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-studio-soft-white/50 block">PLATFORM</span>
                  <span className="text-studio-bronze-light uppercase font-bold">{selectedSlot.platform}</span>
                </div>
                <div>
                  <span className="text-studio-soft-white/50 block">ANGLE</span>
                  <span className="text-studio-bronze-light uppercase font-bold">{selectedSlot.angle.replace("_", " ")}</span>
                </div>
              </div>

              {/* Editable Text */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/50">
                  Campaign Post Content
                </label>
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  rows={8}
                  className="w-full bg-studio-warm-black border border-studio-bronze/10 rounded-lg p-3 text-xs text-studio-soft-white leading-relaxed focus:outline-none focus:border-studio-bronze/30 font-sans"
                  placeholder="Paste or compose post elements directly..."
                  id="modal-post-textarea"
                />
              </div>

              {/* Status and Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/50">
                    Campaign Status
                  </label>
                  <select
                    value={editingStatus}
                    onChange={(e: any) => setEditingStatus(e.target.value)}
                    className="w-full bg-studio-warm-black border border-studio-bronze/10 rounded-lg p-2.5 text-xs text-studio-soft-white focus:outline-none focus:border-studio-bronze/30"
                    id="modal-status-selector"
                  >
                    <option value="draft">Draft State</option>
                    <option value="scheduled">Scheduled for Queue</option>
                    <option value="published">Already Live / Published</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-studio-soft-white/50">
                    Schedules / Dispatch Notes
                  </label>
                  <input
                    type="text"
                    value={editingNotes}
                    onChange={(e) => setEditingNotes(e.target.value)}
                    placeholder="E.g. Target Friday storm groups"
                    className="w-full bg-studio-warm-black border border-studio-bronze/10 rounded-lg p-2.5 text-xs text-studio-soft-white focus:outline-none focus:border-studio-bronze/30 font-sans"
                    id="modal-notes-input"
                  />
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="pt-3 border-t border-studio-bronze/5 flex items-center justify-end gap-3 select-none">
              <button
                onClick={() => setSelectedSlot(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-studio-soft-white hover:bg-studio-brown/30 cursor-pointer"
                id="modal-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSlot}
                className="bg-studio-bronze hover:bg-studio-bronze-light text-studio-warm-black px-5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                id="modal-save-btn"
              >
                <Save className="w-3.5 h-3.5" />
                Commit Schedule
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
