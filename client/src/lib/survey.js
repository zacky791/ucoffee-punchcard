/** "How did you hear about us?" answers. Keep `value`s in sync with server/src/pos/routes.js. */
export const SURVEY_SOURCES = [
  { value: 'banner', label: 'Banner outside the shop' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'friends', label: 'Friends' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
];

/** Explains a failed survey request in plain words, keeping the raw error for troubleshooting. */
export function surveyErrorMessage(err) {
  const raw = String(err?.message || '');
  if (/source_check/.test(raw)) {
    return `The database does not accept this answer yet. Run supabase/pos-survey.sql again in the Supabase SQL Editor. (${raw})`;
  }
  if (/Choose how the customer heard/.test(raw)) {
    return 'The server is running old code that does not know this answer. Restart the server (stop it and run npm run dev again).';
  }
  if (/pos_survey_responses/.test(raw) && /(does not exist|schema cache|could not find)/i.test(raw)) {
    return `Survey is not set up yet. Run supabase/pos-survey.sql in the Supabase SQL Editor. (${raw})`;
  }
  return raw || 'Could not save the answer';
}

export function surveyLabel(value) {
  return SURVEY_SOURCES.find((s) => s.value === value)?.label || value;
}
