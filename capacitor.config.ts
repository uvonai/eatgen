import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.eatgen.app",
  appName: "Eatgen AI",
  webDir: "dist",

  // IMPORTANT: Do NOT use server.url for production.
  // Using a remote URL makes the app behave like a website (permissions won't appear under the app in Settings).

  plugins: {
    Camera: {
      // Keep any Camera plugin configuration here (does not force system camera UI).
      presentationStyle: "fullscreen",
    },
  },

  ios: {
    contentInset: "automatic",
  },

  android: {
    allowMixedContent: true,
  },
};

export default config;
