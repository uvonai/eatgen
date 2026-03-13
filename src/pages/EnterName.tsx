import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const EnterName = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!user) return;

    setLoading(true);
    try {
      // Update the profile with the display_name
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name.trim() })
        .eq("user_id", user.id);

      if (error) throw error;

      // Navigate back immediately - no toast popup
      navigate("/settings");
    } catch (error) {
      console.error("Failed to save name:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Header */}
      <header className="relative z-10 px-6 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 12px) + 12px)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/settings")}
            className="h-10 w-10 rounded-full bg-card/60 border border-border/40 flex items-center justify-center hover:bg-card/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-foreground text-2xl font-bold">Enter Your Name</h1>
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 px-5 pb-10">
        <div className="rounded-2xl bg-card/60 border border-border/40 backdrop-blur-sm p-6">
          <label className="text-muted-foreground text-sm mb-2 block">Your Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            className="bg-muted/30 border-border/40 text-foreground text-lg py-6"
            autoFocus
          />
        </div>

        <button
          onClick={handleSave}
          disabled={loading || !name.trim()}
          className="w-full mt-6 py-4 rounded-2xl bg-foreground text-background font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
};

export default EnterName;