/**
 * 言語コンテキスト
 * アプリ全体で言語設定を共有・管理
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Storage } from '@/packages/platform';
import jaTranslations from './locales/ja.json';
import enTranslations from './locales/en.json';

export type Language = 'ja' | 'en';

interface Translations {
  [key: string]: unknown;
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, defaultValue?: string) => string;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const LANGUAGE_STORAGE_KEY = 'user-language-preference';

const translations: Record<Language, Translations> = {
  ja: jaTranslations,
  en: enTranslations,
};

/**
 * ネストされたキーで翻訳を取得
 * 例: "settings.title" -> translations.settings.title
 */
function getNestedValue(obj: Record<string, unknown>, path: string, defaultValue: string = path): string {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (typeof current === 'object' && current !== null && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }

  return typeof current === 'string' ? current : defaultValue;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ja');
  const [isLoading, setIsLoading] = useState(true);

  // 言語設定を読み込み
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const saved = await Storage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved && (saved === 'ja' || saved === 'en')) {
          setLanguageState(saved);
        }
      } catch (error) {
        console.error('[LanguageContext] Failed to load language:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadLanguage();
  }, []);

  // 言語を変更
  const setLanguage = useCallback(async (lang: Language) => {
    try {
      await Storage.setItem(LANGUAGE_STORAGE_KEY, lang);
      setLanguageState(lang);
    } catch (error) {
      console.error('[LanguageContext] Failed to save language:', error);
    }
  }, []);

  // 翻訳キーでテキストを取得
  const t = useCallback(
    (key: string, defaultValue: string = key): string => {
      return getNestedValue(translations[language], key, defaultValue);
    },
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        isLoading,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

/**
 * 翻訳テキストを取得するフック（簡略版）
 */
export function useTranslation() {
  const { t, language, setLanguage, isLoading } = useLanguage();
  return { t, language, setLanguage, isLoading };
}
