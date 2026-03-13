import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft, Mail, Lock, ShieldCheck, KeyRound } from "lucide-react";
import LanguageSelector from "@/components/LanguageSelector";
import { useLanguage } from "@/contexts/LanguageContext";
import { AnimatePresence, motion } from "framer-motion";
import { hasCompletedOnboarding } from "@/lib/supabase-safe";
import { supabase } from "@/integrations/supabase/client";

type AuthStep =
  | "main"        // Sign in / Sign up toggle
  | "signup-email" // Enter email for signup
  | "otp"         // Enter OTP code
  | "set-password" // Set password after OTP
  | "signin"      // Email + password login
  | "forgot-email" // Enter email for forgot password
  | "forgot-otp"  // Enter OTP for forgot password
  | "forgot-set-password"; // Set new password after forgot OTP

const Auth = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [step, setStep] = useState<AuthStep>("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingSession, setPendingSession] = useState<{ access_token: string; refresh_token: string } | null>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const resetState = () => {
    setStep("main");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setOtpCode("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleGetStarted = () => {
    try {
      navigate("/questionnaire");
    } catch (error) {
      console.error("Navigation error:", error);
    }
  };

  // Send OTP to email via Resend
  const handleSignupSendOtp = async () => {
    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { email, mode: "signup" },
      });

      if (error) {
        // Parse the edge function error response body
        let errorBody: Record<string, string> | null = null;
        try {
          errorBody = await (error as unknown as { context?: Response }).context?.json();
        } catch { /* ignore parse errors */ }

        if (errorBody?.error === "account_exists") {
          toast.error("An account with this email already exists. Please sign in.");
          setStep("signin");
          setIsLoading(false);
          return;
        }

        toast.error(errorBody?.error || "Failed to send verification code");
        setIsLoading(false);
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || "Failed to send verification code");
      } else {
        toast.success("Verification code sent to your email!");
        setResendCooldown(60);
        setStep("otp");
      }
    } catch (e) {
      console.error("OTP send error:", e);
      toast.error("Failed to send verification code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP code via custom edge function
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { email, code: otpCode },
      });
      if (error) {
        let errorBody: Record<string, string> | null = null;
        try {
          errorBody = await (error as unknown as { context?: Response }).context?.json();
        } catch { /* ignore */ }
        toast.error(errorBody?.error || "Invalid code. Please try again.");
        setOtpCode("");
        return;
      }
      if (!data?.success) {
        toast.error(data?.error || "Invalid code. Please try again.");
        setOtpCode("");
        return;
      }

      // For forgot-password flow, store session but don't apply yet
      // (applying it would trigger AuthRoute redirect before password screen shows)
      if (step === "forgot-otp" && data.session) {
        setPendingSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        setStep("forgot-set-password");
      } else {
        // Set session from the returned tokens
        if (data.session) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }

        if (data.isNewUser) {
          toast.success("Account created! Welcome to EatGen AI.");
          navigate("/questionnaire");
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const hasOnboarding = await hasCompletedOnboarding(user.id);
            toast.success("Welcome back!");
            navigate(hasOnboarding ? "/home" : "/questionnaire");
          } else {
            toast.success("Welcome back!");
            navigate("/home");
          }
        }
      }
    } catch (e) {
      console.error("OTP verify error:", e);
      toast.error("Verification failed. Please try again.");
      setOtpCode("");
    } finally {
      setIsLoading(false);
    }
  };

  // Set password after OTP verification (signup or forgot password)
  const handleSetPassword = async () => {
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      // For forgot-password, apply the stored session first so updateUser works
      if (step === "forgot-set-password" && pendingSession) {
        await supabase.auth.setSession(pendingSession);
        setPendingSession(null);
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message || "Failed to set password");
      } else {
        if (step === "set-password") {
          toast.success("Account created! Welcome to Eatgen AI.");
          navigate("/questionnaire");
        } else {
          toast.success("Password updated successfully!");
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const hasOnboarding = await hasCompletedOnboarding(user.id);
            navigate(hasOnboarding ? "/home" : "/questionnaire");
          } else {
            navigate("/home");
          }
        }
      }
    } catch (e) {
      console.error("Set password error:", e);
      toast.error("Failed to set password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Sign in with email + password
  const handleSignIn = async () => {
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message || "Sign in failed");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000));
          const hasOnboarding = await Promise.race([
            hasCompletedOnboarding(user.id),
            timeoutPromise,
          ]);
          toast.success("Welcome back!");
          navigate(hasOnboarding ? "/home" : "/questionnaire");
        } else {
          toast.success("Welcome back!");
          navigate("/home");
        }
      }
    } catch (e) {
      console.error("Sign in error:", e);
      toast.error("Sign in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Send OTP for forgot password via Resend
  const handleForgotSendOtp = async () => {
    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { email },
      });

      if (error) {
        let errorBody: Record<string, string> | null = null;
        try {
          errorBody = await (error as unknown as { context?: Response }).context?.json();
        } catch { /* ignore */ }
        toast.error(errorBody?.error || "Failed to send verification code");
        setIsLoading(false);
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || "Failed to send verification code");
      } else {
        toast.success("Verification code sent to your email!");
        setResendCooldown(60);
        setStep("forgot-otp");
      }
    } catch (e) {
      console.error("Forgot password OTP error:", e);
      toast.error("Failed to send code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle OTP input - auto-advance and auto-submit
  const handleOtpChange = (value: string, index: number) => {
    const digit = value.slice(-1);
    if (digit && !/^\d$/.test(digit)) return;
    
    const newOtp = otpCode.split("");
    newOtp[index] = digit;
    const joined = newOtp.join("").slice(0, 6);
    setOtpCode(joined.padEnd(6, " ").trimEnd());
    
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    setOtpCode(pasted);
    const focusIndex = Math.min(pasted.length, 5);
    otpInputRefs.current[focusIndex]?.focus();
  };

  // Render OTP input boxes
  const renderOtpInput = () => (
    <div className="flex justify-center gap-3 mb-8" onPaste={handleOtpPaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { otpInputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={otpCode[i] || ""}
          onChange={(e) => handleOtpChange(e.target.value, i)}
          onKeyDown={(e) => handleOtpKeyDown(e, i)}
          className="w-[46px] h-[56px] text-center text-2xl font-bold rounded-2xl bg-zinc-900/60 border-2 border-zinc-800 text-white outline-none transition-all duration-300 focus:border-white/60 focus:bg-zinc-800/80 focus:shadow-[0_0_20px_rgba(255,255,255,0.06)]"
          style={{ caretColor: 'transparent' }}
        />
      ))}
    </div>
  );

  // Render back button
  const renderBack = (targetStep: AuthStep) => (
    <button
      onClick={() => {
        if (targetStep === "main") {
          resetState();
        } else {
          setStep(targetStep);
          setOtpCode("");
          setPassword("");
          setConfirmPassword("");
        }
      }}
      className="flex items-center gap-1.5 text-zinc-500 text-[13px] mb-8 transition-all duration-200 hover:text-zinc-300 active:scale-[0.97]"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      <span>Back</span>
    </button>
  );

  // Icon header for drawer steps
  const renderStepIcon = (icon: React.ReactNode) => (
    <div className="flex justify-center mb-5">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
        {icon}
      </div>
    </div>
  );

  // Render drawer content based on step
  const renderDrawerContent = () => {
    switch (step) {
      case "main":
        return (
          <>
            {/* Continue with Email */}
            <button
              onClick={() => setStep("signup-email")}
              className="w-full flex items-center justify-center gap-3 rounded-2xl bg-white py-4 text-[15px] font-medium text-black transition-all duration-200 hover:bg-zinc-100 active:scale-[0.98] mb-3"
            >
              <Mail className="w-[18px] h-[18px]" />
              Continue with Email
            </button>

            {/* Terms */}
            <p className="mt-6 text-center text-[12px] text-zinc-600 leading-relaxed">
              {t("auth.terms")}{" "}
              <a href="https://sites.google.com/view/eatgenai-terms" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline">{t("auth.termsLink")}</a> {t("auth.andAcknowledge")}{" "}
              <a href="https://sites.google.com/view/eatgen-privacy" target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline">{t("auth.privacyLink")}</a>
            </p>
          </>
        );

      case "signup-email":
        return (
          <>
            {renderBack("main")}
            {renderStepIcon(<Mail className="w-5 h-5 text-zinc-400" />)}
            <h2 className="text-[22px] font-bold text-white mb-1.5 text-center">Create Account</h2>
            <p className="text-zinc-500 text-[14px] mb-8 text-center">Enter your email to get started</p>

            <div className="mb-5">
              <label className="block text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-2.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-2xl bg-zinc-900/60 border-2 border-zinc-800 pl-11 pr-4 py-3.5 text-[15px] text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-zinc-600 focus:bg-zinc-800/60 focus:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
                  onKeyDown={(e) => e.key === "Enter" && handleSignupSendOtp()}
                />
              </div>
            </div>

            <button
              onClick={handleSignupSendOtp}
              disabled={!email || isLoading}
              className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-all duration-300 active:scale-[0.98] ${
                email && !isLoading
                  ? "bg-white text-black hover:bg-zinc-100 shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                  : "bg-zinc-900/60 text-zinc-600 cursor-not-allowed border-2 border-zinc-800"
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Sending code...
                </span>
              ) : "Send Verification Code"}
            </button>

            <p className="mt-5 text-center text-[13px] text-zinc-600">
              Already have an account?{" "}
              <button
                onClick={() => { setStep("signin"); setPassword(""); }}
                className="text-white font-medium hover:opacity-80 transition-opacity"
              >
                Sign In
              </button>
            </p>
          </>
        );

      case "otp":
      case "forgot-otp":
        return (
          <>
            {renderBack(step === "otp" ? "signup-email" : "forgot-email")}
            {renderStepIcon(<ShieldCheck className="w-5 h-5 text-zinc-400" />)}
            <h2 className="text-[22px] font-bold text-white mb-1.5 text-center">Verify Your Email</h2>
            <p className="text-zinc-500 text-[14px] mb-8 text-center">
              We sent a 6-digit code to{" "}
              <span className="text-zinc-300 font-medium">{email}</span>
            </p>

            {renderOtpInput()}

            <button
              onClick={handleVerifyOtp}
              disabled={otpCode.replace(/\s/g, "").length !== 6 || isLoading}
              className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-all duration-300 active:scale-[0.98] ${
                otpCode.replace(/\s/g, "").length === 6 && !isLoading
                  ? "bg-white text-black hover:bg-zinc-100 shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                  : "bg-zinc-900/60 text-zinc-600 cursor-not-allowed border-2 border-zinc-800"
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : "Verify Code"}
            </button>

            <button
              onClick={() => {
                if (resendCooldown > 0) return;
                (step === "otp" ? handleSignupSendOtp : handleForgotSendOtp)();
              }}
              disabled={isLoading || resendCooldown > 0}
              className={`w-full text-center text-[13px] transition-all mt-5 ${
                resendCooldown > 0 ? "text-zinc-700 cursor-not-allowed" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : "Didn't receive the code? Resend"}
            </button>
          </>
        );

      case "set-password":
      case "forgot-set-password":
        return (
          <>
            {renderStepIcon(<KeyRound className="w-5 h-5 text-zinc-400" />)}
            <h2 className="text-[22px] font-bold text-white mb-1.5 text-center">
              {step === "set-password" ? "Set Your Password" : "Set New Password"}
            </h2>
            <p className="text-zinc-500 text-[14px] mb-8 text-center">
              {step === "set-password"
                ? "Create a secure password for your account"
                : "Choose a new password for your account"}
            </p>

            <div className="mb-4">
              <label className="block text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-2.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full rounded-2xl bg-zinc-900/60 border-2 border-zinc-800 pl-11 pr-12 py-3.5 text-[15px] text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-zinc-600 focus:bg-zinc-800/60 focus:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Password strength indicator */}
              {password && (
                <div className="mt-2.5 flex gap-1.5">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                        password.length >= level * 3
                          ? level <= 1 ? "bg-red-500/70" : level <= 2 ? "bg-orange-500/70" : level <= 3 ? "bg-yellow-500/70" : "bg-emerald-500/70"
                          : "bg-zinc-800"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-2.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full rounded-2xl bg-zinc-900/60 border-2 border-zinc-800 pl-11 pr-12 py-3.5 text-[15px] text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-zinc-600 focus:bg-zinc-800/60 focus:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
                  onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Match indicator */}
              {confirmPassword && (
                <p className={`mt-2 text-[12px] transition-colors ${
                  password === confirmPassword ? "text-emerald-500/80" : "text-red-400/70"
                }`}>
                  {password === confirmPassword ? "✓ Passwords match" : "✗ Passwords don't match"}
                </p>
              )}
            </div>

            <button
              onClick={handleSetPassword}
              disabled={!password || !confirmPassword || password.length < 6 || password !== confirmPassword || isLoading}
              className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-all duration-300 active:scale-[0.98] ${
                password && confirmPassword && password.length >= 6 && password === confirmPassword && !isLoading
                  ? "bg-white text-black hover:bg-zinc-100 shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                  : "bg-zinc-900/60 text-zinc-600 cursor-not-allowed border-2 border-zinc-800"
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Please wait...
                </span>
              ) : step === "set-password" ? "Create Account" : "Update Password"}
            </button>
          </>
        );

      case "signin":
        return (
          <>
            {renderBack("main")}
            {renderStepIcon(<Lock className="w-5 h-5 text-zinc-400" />)}
            <h2 className="text-[22px] font-bold text-white mb-1.5 text-center">Welcome Back</h2>
            <p className="text-zinc-500 text-[14px] mb-8 text-center">Sign in to your account</p>

            <div className="mb-4">
              <label className="block text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-2.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-2xl bg-zinc-900/60 border-2 border-zinc-800 pl-11 pr-4 py-3.5 text-[15px] text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-zinc-600 focus:bg-zinc-800/60 focus:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
                />
              </div>
            </div>

            <div className="mb-2">
              <label className="block text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-2.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-2xl bg-zinc-900/60 border-2 border-zinc-800 pl-11 pr-12 py-3.5 text-[15px] text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-zinc-600 focus:bg-zinc-800/60 focus:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
                  onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setPassword("");
                setStep("forgot-email");
              }}
              className="w-full text-right text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors mb-5"
            >
              Forgot password?
            </button>

            <button
              onClick={handleSignIn}
              disabled={!email || !password || isLoading}
              className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-all duration-300 active:scale-[0.98] ${
                email && password && !isLoading
                  ? "bg-white text-black hover:bg-zinc-100 shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                  : "bg-zinc-900/60 text-zinc-600 cursor-not-allowed border-2 border-zinc-800"
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : "Sign In"}
            </button>

            <p className="mt-5 text-center text-[13px] text-zinc-600">
              Don't have an account?{" "}
              <button
                onClick={() => { setStep("signup-email"); setPassword(""); }}
                className="text-white font-medium hover:opacity-80 transition-opacity"
              >
                Sign Up
              </button>
            </p>
          </>
        );

      case "forgot-email":
        return (
          <>
            {renderBack("signin")}
            {renderStepIcon(<KeyRound className="w-5 h-5 text-zinc-400" />)}
            <h2 className="text-[22px] font-bold text-white mb-1.5 text-center">Forgot Password</h2>
            <p className="text-zinc-500 text-[14px] mb-8 text-center">
              Enter your email and we'll send you a code
            </p>

            <div className="mb-5">
              <label className="block text-[12px] font-medium text-zinc-500 uppercase tracking-wider mb-2.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-2xl bg-zinc-900/60 border-2 border-zinc-800 pl-11 pr-4 py-3.5 text-[15px] text-white placeholder-zinc-700 outline-none transition-all duration-300 focus:border-zinc-600 focus:bg-zinc-800/60 focus:shadow-[0_0_20px_rgba(255,255,255,0.04)]"
                  onKeyDown={(e) => e.key === "Enter" && handleForgotSendOtp()}
                />
              </div>
            </div>

            <button
              onClick={handleForgotSendOtp}
              disabled={!email || isLoading}
              className={`w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-all duration-300 active:scale-[0.98] ${
                email && !isLoading
                  ? "bg-white text-black hover:bg-zinc-100 shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                  : "bg-zinc-900/60 text-zinc-600 cursor-not-allowed border-2 border-zinc-800"
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  Sending code...
                </span>
              ) : "Send Code"}
            </button>
          </>
        );

      default:
        return null;
    }
  };

  // Full-page step content wrapper
  const renderStepPage = () => (
    <motion.div
      key={step}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="fixed inset-0 z-30 flex flex-col bg-black overflow-y-auto"
    >

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-gradient-to-b from-violet-500/[0.06] via-purple-500/[0.03] to-transparent blur-[120px]" />
      </div>

      <motion.div
        className="relative z-10 flex flex-1 flex-col justify-center px-8 max-w-md mx-auto w-full"
        style={{ paddingTop: "max(env(safe-area-inset-top), 24px)", paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
        }}
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
          }}
        >
          {renderDrawerContent()}
        </motion.div>
      </motion.div>
    </motion.div>
  );

  const isOnSubStep = step !== "main";

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-transparent">
      {/* Language Selector (main page) */}
      {!isOnSubStep && (
        <div
          className="absolute right-4 z-20"
          style={{ top: "max(env(safe-area-inset-top), 12px)" }}
        >
          <LanguageSelector />
        </div>
      )}

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-gradient-to-b from-violet-500/[0.08] via-purple-500/[0.04] to-transparent blur-[120px]" />
        <div className="absolute top-1/3 -left-24 h-[300px] w-[300px] rounded-full bg-gradient-to-br from-blue-500/[0.06] to-transparent blur-[80px]" />
        <div className="absolute top-1/2 -right-24 h-[250px] w-[250px] rounded-full bg-gradient-to-bl from-fuchsia-500/[0.05] to-transparent blur-[80px]" />
        <div className="absolute bottom-0 left-0 right-0 h-[150px] bg-gradient-to-t from-white/[0.02] to-transparent" />
      </div>

      {/* Main landing content */}
      <div className="relative z-10 flex h-full flex-col justify-end py-6">
        <div
          className="px-8 pt-6"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 32px)" }}
        >
          {/* Headlines */}
          <div className="mb-7 text-center">
            <h1 className="font-display text-[32px] font-semibold leading-[1.15] tracking-tight text-white whitespace-pre-line">
              {t("auth.headline")}
            </h1>
            <p className="mt-4 font-display text-[16px] font-light tracking-[0.02em] text-zinc-400">
              {t("auth.tagline")}
            </p>
          </div>

          {/* Get Started (Skip) */}
          <button
            onClick={handleGetStarted}
            className="w-full rounded-2xl bg-white py-4 text-[15px] font-semibold text-black transition-all duration-200 active:scale-[0.98] active:bg-zinc-100"
          >
            {t("auth.getStarted")}
          </button>

          {/* Sign In Link */}
          <p className="mt-5 text-center text-[13px] text-zinc-500">
            {t("auth.alreadyAccount")}{" "}
            <button
              onClick={() => setStep("signin")}
              className="font-medium text-white transition-opacity hover:opacity-80"
            >
              {t("auth.signIn")}
            </button>
          </p>
        </div>
      </div>

      {/* Full-page overlay for sub-steps */}
      <AnimatePresence mode="wait">
        {isOnSubStep && renderStepPage()}
      </AnimatePresence>
    </div>
  );
};

export default Auth;
