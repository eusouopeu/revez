import { useEffect, useState } from 'react'

function startOfMinute(date: Date): number {
  return Math.floor(date.getTime() / 60_000)
}

/**
 * Reference "now" for every calculation on screen, stable across renders —
 * deriving `new Date()` in a component body makes each render use a
 * slightly different instant and leaves an app kept open overnight showing
 * yesterday's dates. Refreshes when the app comes back to the foreground
 * and once a minute while it is visible.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    function refresh() {
      const now = new Date()
      // Re-render only when the clock actually moved to another minute.
      setToday((prev) => (startOfMinute(prev) === startOfMinute(now) ? prev : now))
    }

    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
