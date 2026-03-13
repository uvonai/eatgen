import { Capacitor } from "@capacitor/core";

export async function openNativeAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { NativeSettings, AndroidSettings, IOSSettings } = await import(
    "capacitor-native-settings"
  );

  await NativeSettings.open({
    optionAndroid: AndroidSettings.ApplicationDetails,
    optionIOS: IOSSettings.App,
  });
}
