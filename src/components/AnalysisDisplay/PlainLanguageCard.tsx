/**
 * PlainLanguageCard — green card showing the plugin's plain-language interpretation.
 * Rule: text comes from plugin.plainLanguage(result) — never hardcoded here.
 */

import './AnalysisDisplay.css'

interface PlainLanguageCardProps {
  text: string
}

export function PlainLanguageCard({ text }: PlainLanguageCardProps) {
  // Guard: ensure text is always a string (plugins might return unexpected types via @ts-nocheck engine)
  const safeText = typeof text === 'string' ? text : String(text ?? '')

  return (
    <div className="plain-language-card">
      <div className="plain-language-icon">&#128161;</div>
      <p>{safeText}</p>
    </div>
  )
}
