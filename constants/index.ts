/**
 * Arabic ↔ English category label map + currency list.
 * UI copy: Modern Standard Arabic (فصيح) per docs/ui-ux-plan.html §1.
 * Used by: chat confirm cards, dashboard legends, edit sheet, settings.
 */
import type { Category } from '@/types';

/** MSA label for each category. */
export const CATEGORY_AR: Record<Category, string> = {
  food: 'أكل',
  coffee: 'قهوة',
  groceries: 'بقالة',
  transport: 'مواصلات',
  utilities: 'فواتير',
  rent: 'إيجار',
  health: 'صحة',
  personal: 'شخصي',
  entertainment: 'ترفيه',
  shopping: 'تسوق',
  education: 'تعليم',
  travel: 'سفر',
  family: 'عائلة',
  charity: 'صدقة',
  other: 'أخرى',
};

/** English label for each category. */
export const CATEGORY_EN: Record<Category, string> = {
  food: 'Food',
  coffee: 'Coffee',
  groceries: 'Groceries',
  transport: 'Transport',
  utilities: 'Utilities',
  rent: 'Rent',
  health: 'Health',
  personal: 'Personal',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  education: 'Education',
  travel: 'Travel',
  family: 'Family',
  charity: 'Charity',
  other: 'Other',
};

/** Chart color ramp: coral → magenta → amber → teal (Flamingo, flat). */
export const CATEGORY_COLORS: string[] = [
  '#F43F5E', // coral
  '#EC4899', // magenta
  '#F59E0B', // amber
  '#0D9488', // teal
  '#BE123C', // deep rose
  '#DB2777', // deep magenta
  '#D97706', // deep amber
  '#0F766E', // deep teal
];

/** Currencies users can log in. EGP is the default. */
export const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'GBP'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/** Arabic display symbol per currency (ج.م for EGP). */
export const CURRENCY_AR: Record<string, string> = {
  EGP: 'ج.م',
  USD: '$',
  EUR: '€',
  SAR: 'ر.س',
  AED: 'د.إ',
  KWD: 'د.ك',
  GBP: '£',
};

/** App-wide constants. */
export const APP = {
  name: 'مصاري',
  timezone: 'Africa/Cairo',
  defaultCurrency: 'EGP' as CurrencyCode,
  maxRecordingSeconds: 30,
  guestRateLimitPerDay: 30,
  audioSampleRate: 16000,
  audioChannels: 1,
} as const;
