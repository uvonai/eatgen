import { useHardwareBackButton } from "@/hooks/useHardwareBackButton";

/**
 * Component that handles hardware back button on native platforms.
 * Must be placed inside BrowserRouter.
 */
export function BackButtonHandler() {
  useHardwareBackButton();
  return null;
}
