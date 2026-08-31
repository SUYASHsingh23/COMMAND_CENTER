import React from 'react'

type Sentiment = 'positive' | 'neutral' | 'frustrated' | 'angry'

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; colorClass: string; emoji: string }> = {
  positive: { label: 'Positive', colorClass: 'badge--green', emoji: '😊' },
  neutral: { label: 'Neutral', colorClass: 'badge--blue', emoji: '😐' },
  frustrated: { label: 'Frustrated', colorClass: 'badge--amber', emoji: '😤' },
  angry: { label: 'Angry', colorClass: 'badge--red', emoji: '😠' },
}

interface Props {
  sentiment: string
  showEmoji?: boolean
}

export function SentimentBadge({ sentiment, showEmoji = true }: Props) {
  const key = (sentiment ?? 'neutral').toLowerCase() as Sentiment
  const config = SENTIMENT_CONFIG[key] ?? SENTIMENT_CONFIG.neutral

  return (
    <span className={`badge ${config.colorClass}`}>
      {showEmoji && <span>{config.emoji}</span>}
      {config.label}
    </span>
  )
}
