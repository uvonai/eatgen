import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global error handlers to prevent app crashes
// These catch errors that escape React's error boundary
window.addEventListener('error', (event) => {
  console.warn('Unhandled error:', event.error);
  event.preventDefault(); // Prevent default browser error handling
});

window.addEventListener('unhandledrejection', (event) => {
  console.warn('Unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent default browser error handling
});

// Initialize dark mode by default or from saved preference
const savedTheme = localStorage.getItem("eatgen_theme");
if (savedTheme === "light") {
  document.documentElement.classList.remove("dark");
} else {
  document.documentElement.classList.add("dark");
  // Set default to dark if no preference saved
  if (!savedTheme) {
    localStorage.setItem("eatgen_theme", "dark");
  }
}

createRoot(document.getElementById("root")!).render(<App />);
