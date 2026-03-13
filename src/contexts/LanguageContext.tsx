import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Language = "en" | "es" | "pt" | "fr" | "de" | "it" | "hi";

interface LanguageConfig {
  code: Language;
  name: string;
  flag: string;
}

export const LANGUAGES: LanguageConfig[] = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
];

// Translations
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Auth page
    "auth.headline": "Know exactly what\nyou eat",
    "auth.tagline": "Eat smarter. Live longer",
    "auth.getStarted": "Get Started",
    "auth.alreadyAccount": "Already have an account?",
    "auth.signIn": "Sign in",
    "auth.signUp": "Sign Up",
    "auth.continueApple": "Continue with Apple",
    "auth.continueGoogle": "Continue with Google",
    "auth.otherOptions": "Other options",
    "auth.back": "Back",
    "auth.email": "Email address",
    "auth.password": "Password",
    "auth.enterEmail": "Enter your email",
    "auth.enterPassword": "Enter your password",
    "auth.createPassword": "Create a password (min 6 chars)",
    "auth.createAccount": "Create Account",
    "auth.pleaseWait": "Please wait...",
    "auth.signingIn": "Signing in...",
    "auth.terms": "By continuing, you agree to our",
    "auth.termsLink": "Terms",
    "auth.privacyLink": "Privacy Policy",
    "auth.andAcknowledge": "and acknowledge our",
    "auth.chooseLanguage": "Choose Language",
    // Home page
    "home.caloriesRemaining": "Calories remaining",
    "home.proteinLeft": "Protein left",
    "home.carbsLeft": "Carbs left",
    "home.fatLeft": "Fat left",
    "home.recentlyLogged": "Recently Logged",
    "home.noMeals": "No meals logged today",
    // Settings
    "settings.title": "Settings",
    "settings.account": "Account",
    "settings.preferences": "Preferences",
    "settings.signOut": "Sign Out",
    // Progress
    "progress.title": "Progress",
    "progress.weekly": "Weekly",
    "progress.monthly": "Monthly",
    // Questionnaire
    "questionnaire.next": "Next",
    "questionnaire.back": "Back",
    "questionnaire.skip": "Skip",
    "questionnaire.continue": "Continue",
    // Common
    "common.loading": "Loading...",
    "common.error": "Error",
    "common.success": "Success",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.close": "Close",
  },
  es: {
    // Auth page
    "auth.headline": "Sabe exactamente lo que\ncomes",
    "auth.tagline": "Come más inteligente. Vive más",
    "auth.getStarted": "Comenzar",
    "auth.alreadyAccount": "¿Ya tienes una cuenta?",
    "auth.signIn": "Iniciar sesión",
    "auth.signUp": "Registrarse",
    "auth.continueApple": "Continuar con Apple",
    "auth.continueGoogle": "Continuar con Google",
    "auth.otherOptions": "Otras opciones",
    "auth.back": "Atrás",
    "auth.email": "Correo electrónico",
    "auth.password": "Contraseña",
    "auth.enterEmail": "Ingresa tu correo",
    "auth.enterPassword": "Ingresa tu contraseña",
    "auth.createPassword": "Crear contraseña (mín 6 caracteres)",
    "auth.createAccount": "Crear cuenta",
    "auth.pleaseWait": "Por favor espera...",
    "auth.signingIn": "Iniciando sesión...",
    "auth.terms": "Al continuar, aceptas nuestros",
    "auth.termsLink": "Términos",
    "auth.privacyLink": "Política de privacidad",
    "auth.andAcknowledge": "y reconoces nuestra",
    "auth.chooseLanguage": "Elegir idioma",
    // Home page
    "home.caloriesRemaining": "Calorías restantes",
    "home.proteinLeft": "Proteína restante",
    "home.carbsLeft": "Carbohidratos restantes",
    "home.fatLeft": "Grasa restante",
    "home.recentlyLogged": "Registrado recientemente",
    "home.noMeals": "No hay comidas registradas hoy",
    // Settings
    "settings.title": "Configuración",
    "settings.account": "Cuenta",
    "settings.preferences": "Preferencias",
    "settings.signOut": "Cerrar sesión",
    // Progress
    "progress.title": "Progreso",
    "progress.weekly": "Semanal",
    "progress.monthly": "Mensual",
    // Questionnaire
    "questionnaire.next": "Siguiente",
    "questionnaire.back": "Atrás",
    "questionnaire.skip": "Omitir",
    "questionnaire.continue": "Continuar",
    // Common
    "common.loading": "Cargando...",
    "common.error": "Error",
    "common.success": "Éxito",
    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.close": "Cerrar",
  },
  pt: {
    // Auth page
    "auth.headline": "Saiba exatamente o que\nvocê come",
    "auth.tagline": "Coma de forma inteligente. Viva mais",
    "auth.getStarted": "Começar",
    "auth.alreadyAccount": "Já tem uma conta?",
    "auth.signIn": "Entrar",
    "auth.signUp": "Cadastrar",
    "auth.continueApple": "Continuar com Apple",
    "auth.continueGoogle": "Continuar com Google",
    "auth.otherOptions": "Outras opções",
    "auth.back": "Voltar",
    "auth.email": "Endereço de email",
    "auth.password": "Senha",
    "auth.enterEmail": "Digite seu email",
    "auth.enterPassword": "Digite sua senha",
    "auth.createPassword": "Criar senha (mín 6 caracteres)",
    "auth.createAccount": "Criar conta",
    "auth.pleaseWait": "Por favor, aguarde...",
    "auth.signingIn": "Entrando...",
    "auth.terms": "Ao continuar, você concorda com nossos",
    "auth.termsLink": "Termos",
    "auth.privacyLink": "Política de privacidade",
    "auth.andAcknowledge": "e reconhece nossa",
    "auth.chooseLanguage": "Escolher idioma",
    // Home page
    "home.caloriesRemaining": "Calorias restantes",
    "home.proteinLeft": "Proteína restante",
    "home.carbsLeft": "Carboidratos restantes",
    "home.fatLeft": "Gordura restante",
    "home.recentlyLogged": "Registrado recentemente",
    "home.noMeals": "Nenhuma refeição registrada hoje",
    // Settings
    "settings.title": "Configurações",
    "settings.account": "Conta",
    "settings.preferences": "Preferências",
    "settings.signOut": "Sair",
    // Progress
    "progress.title": "Progresso",
    "progress.weekly": "Semanal",
    "progress.monthly": "Mensal",
    // Questionnaire
    "questionnaire.next": "Próximo",
    "questionnaire.back": "Voltar",
    "questionnaire.skip": "Pular",
    "questionnaire.continue": "Continuar",
    // Common
    "common.loading": "Carregando...",
    "common.error": "Erro",
    "common.success": "Sucesso",
    "common.cancel": "Cancelar",
    "common.save": "Salvar",
    "common.delete": "Excluir",
    "common.edit": "Editar",
    "common.close": "Fechar",
  },
  fr: {
    // Auth page
    "auth.headline": "Sachez exactement ce que\nvous mangez",
    "auth.tagline": "Mangez plus intelligemment. Vivez plus longtemps",
    "auth.getStarted": "Commencer",
    "auth.alreadyAccount": "Vous avez déjà un compte?",
    "auth.signIn": "Se connecter",
    "auth.signUp": "S'inscrire",
    "auth.continueApple": "Continuer avec Apple",
    "auth.continueGoogle": "Continuer avec Google",
    "auth.otherOptions": "Autres options",
    "auth.back": "Retour",
    "auth.email": "Adresse email",
    "auth.password": "Mot de passe",
    "auth.enterEmail": "Entrez votre email",
    "auth.enterPassword": "Entrez votre mot de passe",
    "auth.createPassword": "Créer un mot de passe (min 6 caractères)",
    "auth.createAccount": "Créer un compte",
    "auth.pleaseWait": "Veuillez patienter...",
    "auth.signingIn": "Connexion...",
    "auth.terms": "En continuant, vous acceptez nos",
    "auth.termsLink": "Conditions",
    "auth.privacyLink": "Politique de confidentialité",
    "auth.andAcknowledge": "et reconnaissez notre",
    "auth.chooseLanguage": "Choisir la langue",
    // Home page
    "home.caloriesRemaining": "Calories restantes",
    "home.proteinLeft": "Protéines restantes",
    "home.carbsLeft": "Glucides restants",
    "home.fatLeft": "Lipides restants",
    "home.recentlyLogged": "Récemment enregistré",
    "home.noMeals": "Aucun repas enregistré aujourd'hui",
    // Settings
    "settings.title": "Paramètres",
    "settings.account": "Compte",
    "settings.preferences": "Préférences",
    "settings.signOut": "Déconnexion",
    // Progress
    "progress.title": "Progrès",
    "progress.weekly": "Hebdomadaire",
    "progress.monthly": "Mensuel",
    // Questionnaire
    "questionnaire.next": "Suivant",
    "questionnaire.back": "Retour",
    "questionnaire.skip": "Passer",
    "questionnaire.continue": "Continuer",
    // Common
    "common.loading": "Chargement...",
    "common.error": "Erreur",
    "common.success": "Succès",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.delete": "Supprimer",
    "common.edit": "Modifier",
    "common.close": "Fermer",
  },
  de: {
    // Auth page
    "auth.headline": "Wissen Sie genau, was\nSie essen",
    "auth.tagline": "Essen Sie klüger. Leben Sie länger",
    "auth.getStarted": "Loslegen",
    "auth.alreadyAccount": "Haben Sie bereits ein Konto?",
    "auth.signIn": "Anmelden",
    "auth.signUp": "Registrieren",
    "auth.continueApple": "Mit Apple fortfahren",
    "auth.continueGoogle": "Mit Google fortfahren",
    "auth.otherOptions": "Andere Optionen",
    "auth.back": "Zurück",
    "auth.email": "E-Mail-Adresse",
    "auth.password": "Passwort",
    "auth.enterEmail": "E-Mail eingeben",
    "auth.enterPassword": "Passwort eingeben",
    "auth.createPassword": "Passwort erstellen (min 6 Zeichen)",
    "auth.createAccount": "Konto erstellen",
    "auth.pleaseWait": "Bitte warten...",
    "auth.signingIn": "Anmeldung...",
    "auth.terms": "Durch Fortfahren stimmen Sie unseren",
    "auth.termsLink": "Bedingungen",
    "auth.privacyLink": "Datenschutzrichtlinie",
    "auth.andAcknowledge": "zu und bestätigen unsere",
    "auth.chooseLanguage": "Sprache wählen",
    // Home page
    "home.caloriesRemaining": "Verbleibende Kalorien",
    "home.proteinLeft": "Verbleibendes Protein",
    "home.carbsLeft": "Verbleibende Kohlenhydrate",
    "home.fatLeft": "Verbleibendes Fett",
    "home.recentlyLogged": "Kürzlich protokolliert",
    "home.noMeals": "Heute keine Mahlzeiten protokolliert",
    // Settings
    "settings.title": "Einstellungen",
    "settings.account": "Konto",
    "settings.preferences": "Präferenzen",
    "settings.signOut": "Abmelden",
    // Progress
    "progress.title": "Fortschritt",
    "progress.weekly": "Wöchentlich",
    "progress.monthly": "Monatlich",
    // Questionnaire
    "questionnaire.next": "Weiter",
    "questionnaire.back": "Zurück",
    "questionnaire.skip": "Überspringen",
    "questionnaire.continue": "Fortfahren",
    // Common
    "common.loading": "Wird geladen...",
    "common.error": "Fehler",
    "common.success": "Erfolg",
    "common.cancel": "Abbrechen",
    "common.save": "Speichern",
    "common.delete": "Löschen",
    "common.edit": "Bearbeiten",
    "common.close": "Schließen",
  },
  it: {
    // Auth page
    "auth.headline": "Sapere esattamente cosa\nmangi",
    "auth.tagline": "Mangia in modo più intelligente. Vivi più a lungo",
    "auth.getStarted": "Inizia",
    "auth.alreadyAccount": "Hai già un account?",
    "auth.signIn": "Accedi",
    "auth.signUp": "Registrati",
    "auth.continueApple": "Continua con Apple",
    "auth.continueGoogle": "Continua con Google",
    "auth.otherOptions": "Altre opzioni",
    "auth.back": "Indietro",
    "auth.email": "Indirizzo email",
    "auth.password": "Password",
    "auth.enterEmail": "Inserisci la tua email",
    "auth.enterPassword": "Inserisci la tua password",
    "auth.createPassword": "Crea password (min 6 caratteri)",
    "auth.createAccount": "Crea account",
    "auth.pleaseWait": "Attendere prego...",
    "auth.signingIn": "Accesso...",
    "auth.terms": "Continuando, accetti i nostri",
    "auth.termsLink": "Termini",
    "auth.privacyLink": "Informativa sulla privacy",
    "auth.andAcknowledge": "e riconosci la nostra",
    "auth.chooseLanguage": "Scegli la lingua",
    // Home page
    "home.caloriesRemaining": "Calorie rimanenti",
    "home.proteinLeft": "Proteine rimanenti",
    "home.carbsLeft": "Carboidrati rimanenti",
    "home.fatLeft": "Grassi rimanenti",
    "home.recentlyLogged": "Registrato di recente",
    "home.noMeals": "Nessun pasto registrato oggi",
    // Settings
    "settings.title": "Impostazioni",
    "settings.account": "Account",
    "settings.preferences": "Preferenze",
    "settings.signOut": "Disconnetti",
    // Progress
    "progress.title": "Progressi",
    "progress.weekly": "Settimanale",
    "progress.monthly": "Mensile",
    // Questionnaire
    "questionnaire.next": "Avanti",
    "questionnaire.back": "Indietro",
    "questionnaire.skip": "Salta",
    "questionnaire.continue": "Continua",
    // Common
    "common.loading": "Caricamento...",
    "common.error": "Errore",
    "common.success": "Successo",
    "common.cancel": "Annulla",
    "common.save": "Salva",
    "common.delete": "Elimina",
    "common.edit": "Modifica",
    "common.close": "Chiudi",
  },
  hi: {
    // Auth page
    "auth.headline": "जानिए आप क्या\nखा रहे हैं",
    "auth.tagline": "स्मार्ट खाएं। लंबे जिएं",
    "auth.getStarted": "शुरू करें",
    "auth.alreadyAccount": "पहले से खाता है?",
    "auth.signIn": "साइन इन करें",
    "auth.signUp": "साइन अप करें",
    "auth.continueApple": "Apple के साथ जारी रखें",
    "auth.continueGoogle": "Google के साथ जारी रखें",
    "auth.otherOptions": "अन्य विकल्प",
    "auth.back": "वापस",
    "auth.email": "ईमेल पता",
    "auth.password": "पासवर्ड",
    "auth.enterEmail": "अपना ईमेल दर्ज करें",
    "auth.enterPassword": "अपना पासवर्ड दर्ज करें",
    "auth.createPassword": "पासवर्ड बनाएं (न्यूनतम 6 अक्षर)",
    "auth.createAccount": "खाता बनाएं",
    "auth.pleaseWait": "कृपया प्रतीक्षा करें...",
    "auth.signingIn": "साइन इन हो रहा है...",
    "auth.terms": "जारी रखकर, आप हमारी सहमति देते हैं",
    "auth.termsLink": "शर्तें",
    "auth.privacyLink": "गोपनीयता नीति",
    "auth.andAcknowledge": "और स्वीकार करते हैं हमारी",
    "auth.chooseLanguage": "भाषा चुनें",
    // Home page
    "home.caloriesRemaining": "शेष कैलोरी",
    "home.proteinLeft": "शेष प्रोटीन",
    "home.carbsLeft": "शेष कार्ब्स",
    "home.fatLeft": "शेष वसा",
    "home.recentlyLogged": "हाल ही में लॉग किया",
    "home.noMeals": "आज कोई भोजन लॉग नहीं किया",
    // Settings
    "settings.title": "सेटिंग्स",
    "settings.account": "खाता",
    "settings.preferences": "प्राथमिकताएं",
    "settings.signOut": "साइन आउट",
    // Progress
    "progress.title": "प्रगति",
    "progress.weekly": "साप्ताहिक",
    "progress.monthly": "मासिक",
    // Questionnaire
    "questionnaire.next": "अगला",
    "questionnaire.back": "वापस",
    "questionnaire.skip": "छोड़ें",
    "questionnaire.continue": "जारी रखें",
    // Common
    "common.loading": "लोड हो रहा है...",
    "common.error": "त्रुटि",
    "common.success": "सफलता",
    "common.cancel": "रद्द करें",
    "common.save": "सहेजें",
    "common.delete": "हटाएं",
    "common.edit": "संपादित करें",
    "common.close": "बंद करें",
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  currentLanguageConfig: LanguageConfig;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem("app-language");
    return (stored as Language) || "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || translations.en[key] || key;
  };

  const currentLanguageConfig = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, currentLanguageConfig }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
