/**
 * PlainLanguageCard — green card showing the plugin's plain-language interpretation.
 * Rule: text comes from plugin.plainLanguage(result) — never hardcoded here.
 */

import './AnalysisDisplay.css'

interface PlainLanguageCardProps {
  text: string
}

export function PlainLanguageCard({ text }: PlainLanguageCardProps) {
  return (
    <div className="plain-language-card">
      <div className="plain-language-icon">💡</div>
      <p>{text}</p>
    </div>
  )
}
