import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Square, Sparkles, ArrowLeft, Paperclip, Camera, Image, X, Copy, Share2, Volume2, VolumeX, ThumbsUp, ThumbsDown } from "lucide-react";
import { useRevenueCatContext } from "@/components/RevenueCatProvider";
import { isIOSNative } from "@/lib/revenuecat";
import { Paywall } from "@/components/Paywall";
import { useAuthContext } from "@/contexts/AuthContext";
import { Capacitor } from "@capacitor/core";
import { compressImageToBase64 } from "@/lib/image-compress";

interface Message {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  imagePreview?: string;
}

interface PendingImage {
  previewUrl: string;
  base64: string;
  fileName: string;
}

const DEFAULT_CHIPS = [
  "Build me a meal plan for this week",
  "What should I improve first?",
  "Set a health goal for me",
];

function parseSuggestions(content: string): { cleanContent: string; suggestions: string[] } {
  const marker = "[SUGGESTIONS]";
  const idx = content.indexOf(marker);
  if (idx === -1) return { cleanContent: content, suggestions: [] };
  const cleanContent = content.slice(0, idx).trim();
  const suggestionsBlock = content.slice(idx + marker.length).trim();
  const suggestions = suggestionsBlock
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.endsWith("?"))
    .slice(0, 3);
  return { cleanContent, suggestions };
}

const VERA_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vera-chat`;
const VERA_LAST_VISIT_KEY = "eatgen_vera_last_visit";
const VERA_MSG_LIMIT_KEY = "eatgen_vera_msg_limit";
const VERA_IMG_LIMIT_KEY = "eatgen_vera_img_limit";
const VERA_EVER_STARTED_KEY = "eatgen_vera_ever_started";
const MAX_MESSAGES_PER_DAY = 30;
const MAX_IMAGES_PER_DAY = 10;

function getVeraLimitData(key: string): { count: number; date: string } {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === new Date().toDateString()) return data;
    }
  } catch {}
  return { count: 0, date: new Date().toDateString() };
}

function incrementVeraLimit(key: string): number {
  const data = getVeraLimitData(key);
  const newData = { count: data.count + 1, date: new Date().toDateString() };
  try { localStorage.setItem(key, JSON.stringify(newData)); } catch {}
  return newData.count;
}

const VERA_BUSY_MESSAGE = "🔥 Vera is overwhelmed right now — lots of people are using her. Please try again after some time.";

// ── Session-level chat state (survives navigation, resets on app close) ──
let sessionMessages: Message[] = [];
let sessionHasStarted = false;
let sessionChips: string[] = DEFAULT_CHIPS;

export function markVeraVisited() {
  try {
    localStorage.setItem(VERA_LAST_VISIT_KEY, new Date().toISOString());
  } catch {}
}

export function getVeraLastVisit(): string | null {
  try {
    return localStorage.getItem(VERA_LAST_VISIT_KEY);
  } catch {}
  return null;
}

async function streamVeraChat({
  messages,
  mode,
  token,
  imageBase64,
  signal,
  onDelta,
  onDone,
  onError,
}: {
  messages: { role: string; content: string }[];
  mode: "init" | "chat";
  token: string;
  imageBase64?: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}) {
  try {
    const resp = await fetch(VERA_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, mode, imageBase64 }),
      signal,
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ error: "Unknown error" }));
      onError(errData.error || `Error ${resp.status}`);
      return;
    }

    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {}
      }
    }

    onDone();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      onDone();
      return;
    }
    onError(e instanceof Error ? e.message : "Connection failed");
  }
}

/* ── TTS with browser Speech Synthesis (woman voice) ── */
function speakText(text: string, onStart?: () => void, onEnd?: () => void) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 1.1;

  // Pick a woman voice
  const voices = window.speechSynthesis.getVoices();
  const femaleVoice = voices.find(v =>
    /female|samantha|karen|fiona|victoria|zira|google.*female/i.test(v.name)
  ) || voices.find(v => /woman|girl/i.test(v.name)) || voices.find(v => v.lang.startsWith("en")) || voices[0];
  if (femaleVoice) utterance.voice = femaleVoice;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/* ── Action buttons below assistant messages ── */
function MessageActions({ content, messageIndex }: { content: string; messageIndex: number }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: content });
      } catch {}
    } else {
      navigator.clipboard.writeText(content);
    }
  }, [content]);

  const handleVoice = useCallback(() => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      speakText(content, () => setSpeaking(true), () => setSpeaking(false));
    }
  }, [content, speaking]);

  return (
    <div className="flex items-center gap-1 mt-1.5 ml-1">
      <button onClick={handleCopy} className="p-1.5 rounded-lg active:bg-muted/40 transition-colors" title="Copy">
        <Copy className={`w-3.5 h-3.5 ${copied ? "text-primary" : "text-muted-foreground/50"}`} />
      </button>
      <button onClick={handleShare} className="p-1.5 rounded-lg active:bg-muted/40 transition-colors" title="Share">
        <Share2 className="w-3.5 h-3.5 text-muted-foreground/50" />
      </button>
      <button onClick={handleVoice} className="p-1.5 rounded-lg active:bg-muted/40 transition-colors" title="Read aloud">
        {speaking ? <VolumeX className="w-3.5 h-3.5 text-primary" /> : <Volume2 className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </button>
      <div className="w-px h-3 bg-border/30 mx-0.5" />
      <button
        onClick={() => setFeedback(f => f === "like" ? null : "like")}
        className="p-1.5 rounded-lg active:bg-muted/40 transition-colors"
        title="Good response"
      >
        <ThumbsUp className={`w-3.5 h-3.5 ${feedback === "like" ? "text-primary fill-primary" : "text-muted-foreground/50"}`} />
      </button>
      <button
        onClick={() => setFeedback(f => f === "dislike" ? null : "dislike")}
        className="p-1.5 rounded-lg active:bg-muted/40 transition-colors"
        title="Bad response"
      >
        <ThumbsDown className={`w-3.5 h-3.5 ${feedback === "dislike" ? "text-destructive fill-destructive" : "text-muted-foreground/50"}`} />
      </button>
    </div>
  );
}

/* ── Assistant bubble — streams directly, strips [SUGGESTIONS] from view ── */
function AssistantBubble({ content, isStreaming, messageIndex }: { content: string; isStreaming?: boolean; messageIndex: number }) {
  const visibleContent = (() => {
    const idx = content.indexOf("[SUGGESTIONS]");
    return idx === -1 ? content : content.slice(0, idx).trim();
  })();

  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-[15px] leading-relaxed bg-card border border-border/40 text-foreground whitespace-pre-wrap">
        {visibleContent || (
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        )}
      </div>
      {!isStreaming && visibleContent && <MessageActions content={visibleContent} messageIndex={messageIndex} />}
    </div>
  );
}

/* ── User bubble with optional image ── */
function UserBubble({ content, imagePreview }: { content: string; imagePreview?: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed bg-foreground text-background">
        {imagePreview && (
          <img src={imagePreview} alt="Attached" className="w-full max-w-[200px] rounded-xl mb-2" />
        )}
        {content}
      </div>
    </div>
  );
}

/* ── Attach popup ── */
function AttachPopup({
  onClose,
  onCamera,
  onGallery,
}: {
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="absolute bottom-24 left-4 right-4 bg-card border border-border/40 rounded-2xl p-2 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <button
          onClick={onCamera}
          className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl active:bg-muted/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
            <Camera className="w-5 h-5 text-foreground" />
          </div>
          <span className="text-[15px] font-medium text-foreground">Camera</span>
        </button>
        <div className="h-px bg-border/30 mx-4" />
        <button
          onClick={onGallery}
          className="flex items-center gap-3 w-full px-4 py-3.5 rounded-xl active:bg-muted/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
            <Image className="w-5 h-5 text-foreground" />
          </div>
          <span className="text-[15px] font-medium text-foreground">Gallery</span>
        </button>
      </div>
    </div>
  );
}

/* ── Main Vera component ── */
export default function Vera() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuthContext();
  const { isPro, isInitialized } = useRevenueCatContext();

  // Check if user has ever started Vera before
  const everStartedBefore = (() => {
    try { return localStorage.getItem(VERA_EVER_STARTED_KEY) === "true"; } catch { return false; }
  })();

  const [messages, setMessages] = useState<Message[]>(sessionMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  // If ever started before, skip intro. Otherwise show intro.
  const [hasStarted, setHasStarted] = useState(sessionHasStarted || everStartedBefore);
  const [showAttach, setShowAttach] = useState(false);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [dynamicChips, setDynamicChips] = useState<string[]>(sessionChips);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasPro = isIOSNative() ? isPro : true;

  // Sync to session-level state
  useEffect(() => {
    sessionMessages = messages;
  }, [messages]);

  useEffect(() => {
    sessionHasStarted = hasStarted;
  }, [hasStarted]);

  useEffect(() => {
    sessionChips = dynamicChips;
  }, [dynamicChips]);

  useEffect(() => {
    markVeraVisited();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingImage]);

  const getToken = useCallback(async () => {
    const { data } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
    return data.session?.access_token || "";
  }, []);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startVera = useCallback(async () => {
    setHasStarted(true);
    try { localStorage.setItem(VERA_EVER_STARTED_KEY, "true"); } catch {}
    setIsInitializing(true);
    const token = await getToken();
    if (!token) { setIsInitializing(false); return; }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let assistantContent = "";
    setMessages([{ role: "assistant", content: "", isStreaming: true }]);

    await streamVeraChat({
      messages: [],
      mode: "init",
      token,
      signal: controller.signal,
      onDelta: (chunk) => {
        assistantContent += chunk;
        setMessages([{ role: "assistant", content: assistantContent, isStreaming: true }]);
      },
      onDone: () => {
        abortControllerRef.current = null;
        const { cleanContent, suggestions } = parseSuggestions(assistantContent);
        setMessages([{ role: "assistant", content: cleanContent, isStreaming: false }]);
        if (suggestions.length > 0) setDynamicChips(suggestions);
        setIsInitializing(false);
      },
      onError: (err) => {
        abortControllerRef.current = null;
        console.error("Vera init error:", err);
        setMessages([{ role: "assistant", content: "I couldn't access your data right now. Try again in a moment." }]);
        setIsInitializing(false);
      },
    });
  }, [getToken]);

  const sendMessage = useCallback(async (text: string, image?: PendingImage) => {
    const hasText = text.trim().length > 0;
    const hasImage = !!image;
    if (!hasText && !hasImage) return;
    if (isLoading) return;

    // Check daily message limit
    const msgData = getVeraLimitData(VERA_MSG_LIMIT_KEY);
    if (msgData.count >= MAX_MESSAGES_PER_DAY) {
      setMessages(prev => [...prev, { role: "assistant", content: VERA_BUSY_MESSAGE }]);
      return;
    }

    // Check daily image limit
    if (hasImage) {
      const imgData = getVeraLimitData(VERA_IMG_LIMIT_KEY);
      if (imgData.count >= MAX_IMAGES_PER_DAY) {
        setMessages(prev => [...prev, { role: "assistant", content: "📸 Vera's image analysis is at capacity today — too many people sending photos. Try again tomorrow or send a text message instead." }]);
        setPendingImage(null);
        return;
      }
      incrementVeraLimit(VERA_IMG_LIMIT_KEY);
    }

    incrementVeraLimit(VERA_MSG_LIMIT_KEY);

    const displayContent = hasText ? text.trim() : "Analyze this food";
    const userMsg: Message = {
      role: "user",
      content: displayContent,
      imagePreview: image?.previewUrl,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImage(null);
    setIsLoading(true);

    const token = await getToken();
    let assistantContent = "";

    // Build text-only messages for API context
    const chatMessages = newMessages
      .filter(m => m.content)
      .map(m => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages([...newMessages, { role: "assistant", content: "", isStreaming: true }]);

    await streamVeraChat({
      messages: chatMessages,
      mode: "chat",
      token,
      imageBase64: hasImage ? image.base64 : undefined,
      signal: controller.signal,
      onDelta: (chunk) => {
        assistantContent += chunk;
        setMessages([...newMessages, { role: "assistant", content: assistantContent, isStreaming: true }]);
      },
      onDone: () => {
        abortControllerRef.current = null;
        const { cleanContent, suggestions } = parseSuggestions(assistantContent);
        setMessages([...newMessages, { role: "assistant", content: cleanContent, isStreaming: false }]);
        if (suggestions.length > 0) setDynamicChips(suggestions);
        setIsLoading(false);
      },
      onError: (err) => {
        abortControllerRef.current = null;
        console.error("Vera chat error:", err);
        setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Please try again." }]);
        setIsLoading(false);
      },
    });
  }, [messages, isLoading, getToken]);

  // Process file to pending image
  const processFile = useCallback(async (file: File) => {
    try {
      const base64 = await compressImageToBase64(file, { maxWidth: 800, maxHeight: 800, quality: 0.7 });
      const previewUrl = URL.createObjectURL(file);
      setPendingImage({ previewUrl, base64, fileName: file.name });
    } catch (e) {
      console.error("Image processing error:", e);
    }
  }, []);

  // Process native photo URI
  const processNativePhoto = useCallback(async (webPath: string) => {
    try {
      const { urlToImageFile } = await import("@/lib/image-file");
      const file = await urlToImageFile(webPath, "vera-photo.jpg");
      await processFile(file);
    } catch (e) {
      console.error("Native photo processing error:", e);
    }
  }, [processFile]);

  // Camera handler
  const handleCamera = useCallback(async () => {
    setShowAttach(false);
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      try {
        const { Camera: CapCamera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const photo = await CapCamera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          correctOrientation: true,
          saveToGallery: false,
          presentationStyle: "fullscreen",
        });
        if (photo?.webPath) {
          await processNativePhoto(photo.webPath);
        }
      } catch (e: any) {
        const msg = e?.message?.toLowerCase() || "";
        if (!msg.includes("cancel")) console.error("Camera error:", e);
      }
    } else {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.capture = "environment";
      inp.onchange = () => {
        const file = inp.files?.[0];
        if (file) processFile(file);
      };
      inp.click();
    }
  }, [processFile, processNativePhoto]);

  // Gallery handler
  const handleGallery = useCallback(async () => {
    setShowAttach(false);
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      try {
        const { Camera: CapCamera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const photo = await CapCamera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Photos,
          correctOrientation: true,
          presentationStyle: "popover",
        });
        if (photo?.webPath) {
          await processNativePhoto(photo.webPath);
        }
      } catch (e: any) {
        const msg = e?.message?.toLowerCase() || "";
        if (!msg.includes("cancel")) console.error("Gallery error:", e);
      }
    } else {
      if (galleryInputRef.current) galleryInputRef.current.click();
    }
  }, [processNativePhoto]);

  const handleGalleryFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (file) processFile(file);
  }, [processFile]);

  const handleSend = useCallback(() => {
    sendMessage(input, pendingImage || undefined);
  }, [input, pendingImage, sendMessage]);

  // For non-premium users, always show the intro screen (reset hasStarted)
  // Admins always get access. On iOS native, check RevenueCat. On web, allow everyone.
  const isNonPremium = isAdmin ? false : (isIOSNative() ? (isInitialized && !isPro) : false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Hidden gallery input for web */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGalleryFile}
      />

      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/20"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 12px) + 12px)" }}
      >
        <button
          onClick={() => navigate("/home")}
          className="w-10 h-10 rounded-full flex items-center justify-center active:bg-muted/30 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2.5 flex-1">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-foreground" />
            {(isInitializing || isLoading) && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-foreground animate-ping" />
            )}
          </div>
          <h1 className="text-[17px] font-semibold text-foreground tracking-tight">
            Eatgen <span className="text-muted-foreground/70 font-normal">Vera</span>
          </h1>
        </div>
      </div>

      {/* Main content */}
      {(!hasStarted || isNonPremium) ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
          {/* Blurred stat previews - creates curiosity */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none" style={{ filter: "blur(8px)", opacity: 0.15 }}>
            <div className="bg-red-500/20 border border-red-500/30 rounded-2xl px-6 py-3 text-red-400 text-sm font-medium">
              ⚠️ 3 harmful additives detected this week
            </div>
            <div className="bg-orange-500/20 border border-orange-500/30 rounded-2xl px-6 py-3 text-orange-400 text-sm font-medium">
              🔥 Daily sodium 187% above safe limit
            </div>
            <div className="bg-red-500/20 border border-red-500/30 rounded-2xl px-6 py-3 text-red-400 text-sm font-medium">
              💀 2 foods linked to inflammation
            </div>
          </div>

          {/* Glowing animated icon */}
          <div className="relative mb-6 z-10">
            <div className="absolute inset-0 w-20 h-20 rounded-full bg-gradient-to-br from-teal-400/40 to-purple-500/40 blur-xl animate-pulse" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-teal-500/20 to-purple-600/20 border border-teal-400/30 flex items-center justify-center">
              <Sparkles className="w-9 h-9 text-teal-400 animate-pulse" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-3 z-10">Hey, I'm Vera</h2>
          <p className="text-muted-foreground text-[15px] leading-relaxed max-w-[300px] mb-10 z-10">
            Your personal AI health companion. I analyze your food, build your health plan, track your progress, and answer anything about your body and nutrition —{" "}
            <span className="text-foreground font-medium">all personalized to you.</span>
          </p>

          {/* Gradient CTA button */}
          <button
            onClick={() => {
              if (isNonPremium) {
                setShowPaywall(true);
              } else {
                startVera();
              }
            }}
            className="relative px-8 py-3.5 rounded-full font-semibold text-[15px] active:scale-[0.97] transition-all z-10 text-white shadow-lg shadow-teal-500/25"
            style={{ background: "linear-gradient(135deg, #14b8a6, #7c3aed)" }}
          >
            <span className="relative z-10">Meet Vera</span>
          </button>
        </div>
      ) : (
        <>
          {/* Chat area */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3"
          >
            {/* Empty state — "What can I help you with?" */}
            {messages.length === 0 && !isInitializing && (
              <div className="flex-1 flex flex-col items-center justify-center h-full min-h-[60vh]">
                <div className="relative mb-5">
                  <div className="absolute inset-0 w-14 h-14 rounded-full bg-gradient-to-br from-teal-400/30 to-purple-500/30 blur-lg animate-pulse" />
                  <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-teal-500/15 to-purple-600/15 border border-teal-400/20 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-teal-400" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-1">What can I help you with?</h2>
                <p className="text-muted-foreground/60 text-sm mb-8">Ask me anything about your health & nutrition</p>
                <div className="flex flex-col gap-2.5 w-full max-w-[320px]">
                  {dynamicChips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => sendMessage(chip)}
                      className="w-full px-4 py-3 rounded-2xl bg-card border border-border/40 text-muted-foreground text-[14px] font-medium active:scale-[0.97] transition-all text-left hover:border-border/60"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading spinner during init */}
            {isInitializing && messages.length === 0 && (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/20 border-t-foreground animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">Vera is analyzing your profile...</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserBubble key={i} content={msg.content} imagePreview={msg.imagePreview} />
              ) : (
                <AssistantBubble key={i} content={msg.content} isStreaming={msg.isStreaming} messageIndex={i} />
              )
            )}

            {/* Suggestion chips — appear after Vera finishes answering */}
            {messages.length > 0 && !isInitializing && !isLoading && (
              <div className="flex flex-wrap gap-2 pt-2 pb-2">
                {dynamicChips.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => sendMessage(chip)}
                    className="px-3.5 py-2 rounded-full bg-card border border-border/40 text-muted-foreground text-[13px] font-medium active:scale-95 transition-transform"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input bar */}
          <div
            className="flex-shrink-0 px-4 py-2 border-t border-border/20 bg-background"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 8px) + 8px)" }}
          >
            {/* Pending image preview */}
            {pendingImage && (
              <div className="mb-2 relative inline-block">
                <img
                  src={pendingImage.previewUrl}
                  alt="Attached preview"
                  className="w-20 h-20 rounded-xl object-cover border border-border/40"
                />
                <button
                  onClick={() => {
                    URL.revokeObjectURL(pendingImage.previewUrl);
                    setPendingImage(null);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center shadow-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 bg-card border border-border/40 rounded-full px-3 py-2">
              <button
                onClick={() => setShowAttach(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:bg-muted/30 transition-colors flex-shrink-0"
              >
                <Paperclip className="w-[18px] h-[18px] text-muted-foreground" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask Vera anything..."
                className="flex-1 bg-transparent text-foreground text-[15px] placeholder:text-muted-foreground/50 outline-none min-w-0"
                disabled={isLoading || isInitializing}
              />
              {isLoading || isInitializing ? (
                <button
                  onClick={handleStop}
                  className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center active:scale-90 transition-all flex-shrink-0"
                >
                  <Square className="w-3.5 h-3.5 text-background fill-background" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && !pendingImage}
                  className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all flex-shrink-0"
                >
                  <Send className="w-4 h-4 text-background" />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Attach popup */}
      {showAttach && (
        <AttachPopup
          onClose={() => setShowAttach(false)}
          onCamera={handleCamera}
          onGallery={handleGallery}
        />
      )}

      {/* Paywall for non-premium users */}
      <Paywall
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribeSuccess={() => {
          setShowPaywall(false);
          startVera();
        }}
      />
    </div>
  );
}
