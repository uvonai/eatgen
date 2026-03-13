import { useState } from "react";
import { X } from "lucide-react";
import { useLanguage, LANGUAGES, Language } from "@/contexts/LanguageContext";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";

const LanguageSelector = () => {
  const { language, setLanguage, currentLanguageConfig, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (lang: Language) => {
    setLanguage(lang);
    setIsOpen(false);
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-full bg-foreground/10 backdrop-blur-sm px-2.5 py-1.5 text-[12px] font-medium text-foreground/90 transition-all hover:bg-foreground/15 active:scale-95">
          <span className="text-sm">{currentLanguageConfig.flag}</span>
          <span>{language.toUpperCase()}</span>
        </button>
      </DrawerTrigger>
      <DrawerContent className="bg-background border-t border-border/50">
        <div className="mx-auto w-full max-w-md px-6 pb-10 pt-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-foreground">{t("auth.chooseLanguage")}</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Language options */}
          <div className="space-y-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-[15px] font-medium transition-all duration-200 active:scale-[0.98] ${
                  language === lang.code
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted/70"
                }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default LanguageSelector;