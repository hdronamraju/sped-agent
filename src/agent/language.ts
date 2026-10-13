export function isEnglish(lang?: string): boolean {
  return !lang || /^(en|eng|english|inglés|ingles)$/i.test(lang.trim());
}

/** Languages with built-in, reviewed templates. Others need translation. */
export function templateLanguage(lang?: string): "en" | "es" | null {
  if (isEnglish(lang)) return "en";
  if (/^(es|spa|spanish|español|espanol)$/i.test(lang!.trim())) return "es";
  return null;
}
