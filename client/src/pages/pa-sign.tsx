/**
 * Public prescriber e-signature page — /pa-sign/:token
 *
 * No auth required. Accessed via a secure one-time link emailed to the prescriber.
 * Loads the PA letter, presents a signature canvas (draw or typed name), and submits.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Loader2, PenLine, RotateCcw, Send, FileText, XCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PaSignDetails {
  medicationName: string;
  patientFirstName: string;
  prescriberName: string | null;
  letterHtml: string;
  letterText: string;
}

// ── Signature Canvas ──────────────────────────────────────────────────────────
function SignatureCanvas({
  onSignature,
}: {
  onSignature: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const hasStrokes = useRef(false);

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const src = "touches" in e ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * (canvas.width / rect.width),
      y: (src.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function start(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    hasStrokes.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  }

  function move(e: MouseEvent | TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    if (hasStrokes.current) {
      onSignature(canvasRef.current!.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
    onSignature(null);
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.addEventListener("mousedown", start, { passive: false });
    canvas.addEventListener("mousemove", move, { passive: false });
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-white overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={640}
          height={160}
          className="w-full"
          style={{ cursor: "crosshair", display: "block" }}
        />
        <span className="absolute bottom-2 left-3 text-xs text-slate-400 pointer-events-none select-none">
          Sign here
        </span>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={clear} className="gap-1 text-slate-600">
        <RotateCcw className="h-3.5 w-3.5" /> Clear
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PaSignPage() {
  const { token } = useParams<{ token: string }>();

  const [details, setDetails] = useState<PaSignDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [signerName, setSignerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showLetter, setShowLetter] = useState(false);

  // ── Load PA details ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`/api/pa-sign/${encodeURIComponent(token)}/details`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any).message || "Invalid or expired signature link.");
        }
        return res.json();
      })
      .then((data) => {
        setDetails(data);
        setSignerName(data.prescriberName ?? "");
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // ── Generate typed-name signature as data URL ────────────────────────────
  function generateTypedSignatureDataUrl(name: string): string {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 640, 160);
    ctx.font = "italic 52px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
    ctx.fillStyle = "#1a1a1a";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 20, 80);
    return canvas.toDataURL("image/png");
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitError(null);
    const name = signerName.trim();
    if (!name) { setSubmitError("Please enter your full name."); return; }

    let signatureDataUrl: string;
    if (tab === "draw") {
      if (!drawnDataUrl) { setSubmitError("Please draw your signature first."); return; }
      signatureDataUrl = drawnDataUrl;
    } else {
      if (!typedName.trim()) { setSubmitError("Please type your name to generate a signature."); return; }
      signatureDataUrl = generateTypedSignatureDataUrl(typedName.trim());
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/pa-sign/${encodeURIComponent(token!)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl, signerName: name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).message || "Submission failed. Please try again.");
      }
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── States ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading signature request…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-xl border shadow-sm p-8 text-center space-y-4">
          <XCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h1 className="text-lg font-semibold">Link Unavailable</h1>
          <p className="text-sm text-slate-500">{loadError}</p>
          <p className="text-xs text-slate-400">
            This link may have expired or already been used. Contact Concordia Pharmacy at (718) 830-8833 if you need a new link.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-xl border shadow-sm p-8 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-800">Signature Received</h1>
          <p className="text-sm text-slate-600">
            Thank you, {signerName}. Your electronic signature has been applied to the prior authorization letter for{" "}
            <strong>{details?.medicationName}</strong> and the Concordia Pharmacy team has been notified.
          </p>
          <p className="text-xs text-slate-400">You may close this window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center shrink-0">
            <PenLine className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">Prescriber Signature Request</h1>
            <p className="text-xs text-slate-500">Concordia Pharmacy: Prior Authorization</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Info card */}
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-500">Signature requested for</p>
              <p className="text-lg font-bold text-slate-800">{details!.medicationName}</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Patient: <span className="font-medium text-slate-700">{details!.patientFirstName}</span>
              </p>
            </div>
            <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 shrink-0">
              Signature Required
            </Badge>
          </div>

          <Separator />

          <p className="text-sm text-slate-600 leading-relaxed">
            Concordia Pharmacy has prepared a prior authorization (PA) request letter for the above medication.
            Your electronic signature is required before the letter can be submitted to the insurance payer.
            Please review the letter below and sign where indicated.
          </p>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowLetter((v) => !v)}
          >
            <FileText className="h-4 w-4" />
            {showLetter ? "Hide Letter" : "Review PA Letter"}
          </Button>

          {showLetter && (
            <div className="border rounded-lg overflow-hidden mt-2">
              <iframe
                srcDoc={details!.letterHtml}
                title="Prior Authorization Letter"
                className="w-full"
                style={{ height: 480, border: 0 }}
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>

        {/* Signature panel */}
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary" />
            Your Signature
          </h2>

          {/* Full name field */}
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">
              Full name <span className="text-red-500">*</span>
            </label>
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Dr. Jane Smith"
              className="max-w-xs"
            />
          </div>

          {/* Tab switcher */}
          <div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4">
              <button
                type="button"
                onClick={() => setTab("draw")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "draw" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Draw
              </button>
              <button
                type="button"
                onClick={() => setTab("type")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === "type" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Type
              </button>
            </div>

            {tab === "draw" ? (
              <SignatureCanvas onSignature={setDrawnDataUrl} />
            ) : (
              <div className="space-y-3">
                <Input
                  placeholder="Type your full name to generate a signature"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="max-w-sm"
                />
                {typedName && (
                  <div className="border rounded-lg bg-white px-4 py-2">
                    <p
                      style={{
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
                        fontStyle: "italic",
                        fontSize: "2rem",
                        color: "#1a1a1a",
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {typedName}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Legal notice */}
          <p className="text-xs text-slate-400 leading-relaxed">
            By clicking "Submit Signature", you confirm that you are the licensed prescriber named above,
            you have reviewed the prior authorization letter, and you authorize Concordia Pharmacy to submit
            it to the insurance payer on your behalf. This e-signature is for workflow documentation purposes.
          </p>

          {submitError && (
            <p className="text-sm text-red-600 font-medium">{submitError}</p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2 min-w-[160px]"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
              ) : (
                <><Send className="h-4 w-4" /> Submit Signature</>
              )}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400">
          Concordia Pharmacy · 96-01 63rd Dr, Rego Park, NY 11374 · (718) 830-8833
        </p>
      </div>
    </div>
  );
}
