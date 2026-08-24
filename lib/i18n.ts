/**
 * Minimal Arabic-first i18n store (Zustand + AsyncStorage persistence).
 * UI copy: Modern Standard Arabic (فصيح) default, English toggle (docs/ui-ux-plan §1).
 * RTL is derived from language. Used by: every screen and component that renders copy.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppLanguage, NumeralSystem, ThemePref } from '@/types';

/** Full UI string table — ar (MSA) primary, en secondary. */
export const STRINGS: Record<AppLanguage, Record<string, string>> = {
  ar: {
    // Tabs
    tab_chat: 'المحادثة',
    tab_dashboard: 'لوحة التحكم',
    tab_settings: 'الإعدادات',
    // Welcome / auth
    welcome_pitch: 'سجّل مصروفاتك بالحديث أو الكتابة، ودع مساري ينظّمها لك',
    create_account: 'إنشاء حساب',
    continue_guest: 'الدخول كضيف',
    guest_privacy_note: 'بياناتك محفوظة على جهازك فقط',
    or_continue_with: 'أو المتابعة عبر',
    // Chat
    chat_placeholder: 'اكتب مصروفًا…',
    saving: 'جاري الحفظ…',
    confirm: 'تأكيد',
    edit: 'تعديل',
    delete: 'حذف',
    save: 'حفظ',
    cancel: 'إلغاء',
    today: 'اليوم',
    yesterday: 'أمس',
    offline_banner: 'سيتم الحفظ دون اتصال — وتتم المزامنة عند عودة الإنترنت',
    example_1: 'شريت قهوة بـ 20',
    example_2: 'دفعت 50 لأحمد امبارح',
    example_3: 'كام صرفت الشهر ده؟',
    guest_badge: 'ضيف',
    account_badge: 'حساب',
    // Dashboard
    period_today: 'اليوم',
    period_week: 'الأسبوع',
    period_month: 'الشهر',
    period_all: 'الكل',
    total_spend: 'إجمالي المصروفات',
    synced: 'متزامن ✓',
    not_synced: 'غير متزامن',
    empty_dashboard: 'لا توجد مصروفات بعد — سجّل أول واحدة من المحادثة',
    go_to_chat: 'اذهب إلى المحادثة',
    // Edit sheet
    edit_expense: 'تعديل المصروف',
    category_label: 'الفئة',
    date_label: 'التاريخ',
    merchant_person: 'المتجر / الشخص',
    notes_label: 'ملاحظات',
    day_before_yesterday: 'قبل يومين',
    // Settings
    account: 'الحساب',
    guest: 'ضيف',
    upgrade_prompt: 'أنشئ حسابًا واحفظ بياناتك',
    language: 'اللغة',
    numerals: 'الأرقام',
    default_currency: 'العملة الافتراضية',
    categories_count: 'الفئات',
    backup_import: 'النسخ الاحتياطي والاستيراد',
    about: 'حول مساري',
    sign_out: 'تسجيل الخروج',
    theme: 'المظهر',
    theme_system: 'حسب النظام',
    theme_light: 'فاتح',
    theme_dark: 'غامق',
    // Onboarding
    onboarding_value_title: 'مصروفاتك في رسالة واحدة',
    onboarding_value_body: 'اكتب أو انطق ما صرفته، ومساري يحوّله إلى سجل منظم تلقائيًا',
    onboarding_voice_title: 'تسجيل بالصوت',
    onboarding_voice_body: 'اضغط زر الميكروفون وتحدث بشكل طبيعي — عربي، إنجليزي، أو مختلط',
    onboarding_privacy_title: 'خصوصيتك أولًا',
    onboarding_privacy_body: 'يمكنك استخدام التطبيق كضيف دون حساب — تبقى بياناتك على جهازك فقط',
    onboarding_next: 'التالي',
    onboarding_start: 'ابدأ الآن',
    // Misc
    retry: 'إعادة المحاولة',
    error_generic: 'حدث خطأ — حاول مرة أخرى',
  },
  en: {
    tab_chat: 'Chat',
    tab_dashboard: 'Dashboard',
    tab_settings: 'Settings',
    welcome_pitch: 'Log expenses by voice or text, and let Masary organize them for you',
    create_account: 'Create account',
    continue_guest: 'Continue as guest',
    guest_privacy_note: 'Your data stays on this device only',
    or_continue_with: 'Or continue with',
    chat_placeholder: 'Type an expense…',
    saving: 'Saving…',
    confirm: 'Confirm',
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    today: 'Today',
    yesterday: 'Yesterday',
    offline_banner: 'Will save offline — syncs when back online',
    example_1: 'Bought coffee for 20',
    example_2: 'Paid Ahmed 50 yesterday',
    example_3: 'How much did I spend this month?',
    guest_badge: 'Guest',
    account_badge: 'Account',
    period_today: 'Today',
    period_week: 'Week',
    period_month: 'Month',
    period_all: 'All',
    total_spend: 'Total spend',
    synced: 'Synced ✓',
    not_synced: 'Not synced',
    empty_dashboard: 'No expenses yet — log your first one from chat',
    go_to_chat: 'Go to chat',
    edit_expense: 'Edit expense',
    category_label: 'Category',
    date_label: 'Date',
    merchant_person: 'Merchant / Person',
    notes_label: 'Notes',
    day_before_yesterday: '2 days ago',
    account: 'Account',
    guest: 'Guest',
    upgrade_prompt: 'Create an account to keep your data',
    language: 'Language',
    numerals: 'Numerals',
    default_currency: 'Default currency',
    categories_count: 'Categories',
    backup_import: 'Backup & import',
    about: 'About Masary',
    sign_out: 'Sign out',
    theme: 'Theme',
    theme_system: 'System',
    theme_light: 'Light',
    theme_dark: 'Dark',
    onboarding_value_title: 'Your expenses in one message',
    onboarding_value_body: 'Type or say what you spent, and Masary turns it into an organized record',
    onboarding_voice_title: 'Voice logging',
    onboarding_voice_body: 'Press the mic button and speak naturally — Arabic, English, or mixed',
    onboarding_privacy_title: 'Privacy first',
    onboarding_privacy_body: 'Use the app as a guest with no account — your data stays on your device',
    onboarding_next: 'Next',
    onboarding_start: 'Get started',
    retry: 'Retry',
    error_generic: 'Something went wrong — try again',
  },
};

/** Local UI preferences persisted on device. */
interface PrefsState {
  language: AppLanguage;
  numerals: NumeralSystem;
  theme: ThemePref;
  onboarded: boolean;
  setLanguage: (l: AppLanguage) => void;
  setNumerals: (n: NumeralSystem) => void;
  setTheme: (t: ThemePref) => void;
  setOnboarded: (v: boolean) => void;
}

/** Zustand store for language / numerals / theme / onboarding. */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      language: 'ar',
      numerals: 'western',
      theme: 'system',
      onboarded: false,
      setLanguage: (language) => set({ language }),
      setNumerals: (numerals) => set({ numerals }),
      setTheme: (theme) => set({ theme }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    { name: 'masary-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Translate helper — hook-free read for the current language table. */
export function t(key: string, lang?: AppLanguage): string {
  const table = STRINGS[lang ?? usePrefs.getState().language];
  return table[key] ?? STRINGS.ar[key] ?? key;
}
